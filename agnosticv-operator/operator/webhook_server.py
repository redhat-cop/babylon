import asyncio
import json
import logging
import hmac
import hashlib
from datetime import datetime, timezone

from aiohttp import web, ClientError
from agnosticvrepo import AgnosticVRepo
from agnosticvcomponent import AgnosticVComponent
from babylon import Babylon


class WebhookServer:
    def __init__(self, port=8080):
        self.port = port
        self.app = web.Application()
        self.setup_routes()
        self.logger = logging.getLogger(__name__)
        # Cache for webhook secrets to avoid repeated Kubernetes API calls
        self.webhook_secret_cache = {}
        self.cache_ttl = 300  # 5 minutes TTL for cached secrets
        
    def setup_routes(self):
        """Setup webhook HTTP routes"""
        self.app.router.add_post('/webhook/github', self.handle_github_webhook)
        self.app.router.add_get('/health', self.health_check)
        self.app.router.add_get('/webhook/status', self.webhook_status)
        
    async def health_check(self, request):
        """Health check endpoint"""
        return web.json_response({
            "status": "healthy",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "service": "babylon-agnosticv-operator-webhook"
        })
    
    async def webhook_status(self, request):
        """Webhook status endpoint"""
        return web.json_response({
            "status": "ready",
            "supported_events": ["push", "pull_request"],
            "timestamp": datetime.now(timezone.utc).isoformat()
        })
    
    def verify_github_signature(self, payload_body, signature, secret):
        """Verify GitHub webhook signature"""
        if not secret:
            return False  # Fails if no secret configured
            
        if not signature:
            return False
            
        # GitHub sends signature as "sha256=<hash>"
        if not signature.startswith('sha256='):
            return False
            
        expected_signature = 'sha256=' + hmac.new(
            secret.encode('utf-8'),
            payload_body,
            hashlib.sha256
        ).hexdigest()
        
        return hmac.compare_digest(signature, expected_signature)
    
    async def handle_github_webhook(self, request):
        """Handle incoming GitHub webhook requests"""
        try:
            # Get headers
            event_type = request.headers.get('X-GitHub-Event')
            signature = request.headers.get('X-Hub-Signature-256')
            delivery_id = request.headers.get('X-GitHub-Delivery')
            
            # Read payload
            payload_body = await request.read()
            
            self.logger.info(f"Received GitHub webhook: event={event_type}, delivery={delivery_id}")
            
            # Only handle push and pull_request events
            if event_type not in ['push', 'pull_request']:
                self.logger.debug(f"Ignoring unsupported event: {event_type}")
                return web.json_response({
                    "status": "ignored",
                    "reason": f"Event type '{event_type}' not supported"
                }, status=200)
            
            # Parse JSON payload (minimal parsing for signature verification)
            try:
                payload = json.loads(payload_body.decode('utf-8'))
            except json.JSONDecodeError as e:
                self.logger.error(f"Invalid JSON payload: {e}")
                return web.json_response({
                    "error": "Invalid JSON payload"
                }, status=400)
            
            # SECURITY: Verify signature FIRST before any other processing
            # Extract minimal info needed to find the repository for signature verification
            repository = payload.get('repository', {})
            if not isinstance(repository, dict):
                self.logger.warning(f"Invalid repository field type: {type(repository)}")
                return web.json_response({
                    "error": "Invalid repository field format"
                }, status=400)
            
            repo_full_name = repository.get('full_name', '')
            repo_url = repository.get('clone_url', '')
            
            if not repo_full_name or not repo_url:
                self.logger.warning(f"Missing required repository fields: full_name={repo_full_name}, clone_url={repo_url}")
                return web.json_response({
                    "error": "Missing required repository fields"
                }, status=400)
            
            # Find matching AgnosticVRepo(s) for signature verification
            agnosticv_repos = await self.find_matching_repos(repo_full_name, repo_url, event_type, payload)
            if not agnosticv_repos:
                self.logger.debug(f"No matching AgnosticVRepo found for {repo_full_name}")
                return web.json_response({
                    "status": "ignored",
                    "reason": f"No matching AgnosticVRepo found for {repo_full_name}"
                }, status=200)
            
            # Process based on event type
            if event_type == 'push':
                return await self.handle_push_event(agnosticv_repos, payload, payload_body, signature, repo_full_name)
            elif event_type == 'pull_request':
                return await self.handle_pull_request_event(agnosticv_repos, payload, payload_body, signature, repo_full_name)
            else:
                return web.json_response({
                    "error": "Unsupported event type"
                }, status=400)
            
        except Exception as e:
            self.logger.exception(f"Error handling webhook: {e}")
            return web.json_response({
                "error": "Internal server error"
            }, status=500)
    
    async def find_matching_repos(self, repo_full_name, repo_url, event_type, payload):
        """Find AgnosticVRepo(s) that match the webhook payload"""
        try:
            # Get current namespace from service account
            current_namespace = await self.get_current_namespace()
            matching_repos = []
            
            async for agnosticv_repo in AgnosticVRepo.list(namespace=current_namespace):
                # Check if git URL matches
                if self.urls_match(agnosticv_repo.git_url, repo_url):
                    if event_type == 'push':
                        # For push events, match on the pushed branch
                        ref = payload.get('ref', '')
                        branch_name = ref.replace('refs/heads/', '') if ref.startswith('refs/heads/') else ref
                        if agnosticv_repo.git_ref == branch_name:
                            matching_repos.append(agnosticv_repo)
                    elif event_type == 'pull_request':
                        # For PR events, ONLY match repos that have preloadPullRequests enabled
                        # Production repos without PR support should never receive PR events
                        if agnosticv_repo.github_preload_pull_requests:
                            matching_repos.append(agnosticv_repo)
            
            return matching_repos
        except Exception as e:
            self.logger.error(f"Error finding matching repos: {e}")
            return []
    
    async def get_current_namespace(self):
        """Get the current namespace from service account token"""
        try:
            # Read namespace from service account token mount
            with open('/var/run/secrets/kubernetes.io/serviceaccount/namespace', 'r') as f:
                return f.read().strip()
        except Exception:
            # Fallback to default if unable to read
            return 'default'
    
    def urls_match(self, configured_url, webhook_url):
        """Check if two git URLs refer to the same repository"""
        # Normalize URLs for comparison
        def normalize_url(url):
            if not url:
                return ""
            # Remove .git suffix
            url = url.rstrip('.git')
            # Convert SSH to HTTPS for comparison
            if url.startswith('git@github.com:'):
                url = url.replace('git@github.com:', 'https://github.com/')
            return url.lower()
        
        return normalize_url(configured_url) == normalize_url(webhook_url)
    
    async def get_webhook_secret(self, agnosticv_repo):
        """Get webhook secret for signature verification with caching"""
        webhook_secret_name = agnosticv_repo.spec.get('gitHub', {}).get('webhookSecret')
        if not webhook_secret_name:
            return None
            
        # Create cache key
        cache_key = f"{agnosticv_repo.namespace}/{webhook_secret_name}"
        current_time = datetime.now(timezone.utc).timestamp()
        
        # Check cache first
        if cache_key in self.webhook_secret_cache:
            cached_entry = self.webhook_secret_cache[cache_key]
            if current_time - cached_entry['timestamp'] < self.cache_ttl:
                self.logger.debug(f"Using cached webhook secret for {webhook_secret_name}")
                return cached_entry['secret']
            else:
                # Cache expired, remove entry
                del self.webhook_secret_cache[cache_key]
        
        # Fetch from Kubernetes
        try:
            secret = await Babylon.core_v1_api.read_namespaced_secret(
                name=webhook_secret_name,
                namespace=agnosticv_repo.namespace
            )
            secret_data = secret.data.get('secret')
            if secret_data:
                from base64 import b64decode
                decoded_secret = b64decode(secret_data).decode('utf-8')
                
                # Cache the secret
                self.webhook_secret_cache[cache_key] = {
                    'secret': decoded_secret,
                    'timestamp': current_time
                }
                
                self.logger.debug(f"Cached webhook secret from Kubernetes secret {webhook_secret_name}")
                return decoded_secret
            return None
        except Exception as e:
            self.logger.warning(f"Failed to get webhook secret from Kubernetes: {e}")
            return None
    
    def clear_webhook_secret_cache(self, agnosticv_repo=None, webhook_secret_name=None):
        """Clear webhook secret cache for specific repo or all cache"""
        if agnosticv_repo and webhook_secret_name:
            # Clear specific cache entry
            cache_key = f"{agnosticv_repo.namespace}/{webhook_secret_name}"
            if cache_key in self.webhook_secret_cache:
                del self.webhook_secret_cache[cache_key]
                self.logger.debug(f"Cleared webhook secret cache for {cache_key}")
        else:
            # Clear entire cache
            self.webhook_secret_cache.clear()
            self.logger.debug("Cleared entire webhook secret cache")
    
    async def trigger_repo_update(self, agnosticv_repo, branch_name, commits):
        """Trigger immediate repository update"""
        try:
            # Create a logger for this operation
            logger = logging.getLogger(f'webhook.{agnosticv_repo.name}')
            
            logger.info(f"Webhook triggered update for {agnosticv_repo.name}#{branch_name}")
            
            # Acquire lock and trigger update (skip PR processing for push events)
            async with agnosticv_repo.lock:
                await agnosticv_repo.manage_components(
                    changed_only=True,
                    logger=logger,
                    skip_pr_processing=True
                )
            
            logger.info(f"Webhook update completed for {agnosticv_repo.name}")
            
        except Exception as e:
            self.logger.error(f"Error triggering repo update: {e}")
            raise
    
    async def handle_push_event(self, agnosticv_repos, payload, payload_body, signature, repo_full_name):
        """Handle push webhook events"""
        ref = payload.get('ref', '')
        branch_name = ref.replace('refs/heads/', '') if ref.startswith('refs/heads/') else ref
        commits = payload.get('commits', [])
        
        # Validate commits field is a list
        if not isinstance(commits, list):
            self.logger.warning(f"Invalid commits field type: {type(commits)}")
            commits = []  # Use empty list as fallback
        
        self.logger.info(f"Push webhook: repo={repo_full_name}, branch={branch_name}, commits={len(commits)}")
        
        results = []
        for agnosticv_repo in agnosticv_repos:
            # Check if this repo's branch matches the pushed branch
            if agnosticv_repo.git_ref != branch_name:
                self.logger.debug(f"Skipping {agnosticv_repo.name}: branch mismatch ({agnosticv_repo.git_ref} != {branch_name})")
                continue
                
            # SECURITY: Verify webhook signature for this repo
            webhook_secret = await self.get_webhook_secret(agnosticv_repo)
            if not self.verify_github_signature(payload_body, signature, webhook_secret):
                self.logger.warning(f"Invalid webhook signature for {agnosticv_repo.name}")
                continue
            
            try:
                # For push events, trigger immediate update of the main branch only
                # This processes the main branch changes without processing all PRs
                await self.trigger_repo_update(agnosticv_repo, branch_name, commits)
                results.append({
                    "repo": agnosticv_repo.name,
                    "branch": branch_name,
                    "status": "updated"
                })
            except Exception as e:
                self.logger.error(f"Error processing push for {agnosticv_repo.name}: {e}")
                results.append({
                    "repo": agnosticv_repo.name,
                    "branch": branch_name,
                    "status": "failed",
                    "error": str(e)
                })
        
        if not results:
            return web.json_response({
                "error": "No valid repositories processed (signature verification failed)"
            }, status=401)
        
        return web.json_response({
            "status": "success",
            "event_type": "push",
            "branch": branch_name,
            "commits_processed": len(commits),
            "repositories": results
        }, status=200)
    
    async def handle_pull_request_event(self, agnosticv_repos, payload, payload_body, signature, repo_full_name):
        """Handle pull_request webhook events"""
        # Filter repos that have preloadPullRequests enabled
        preload_repos = [repo for repo in agnosticv_repos if repo.github_preload_pull_requests]
        
        # If no repos have preloadPullRequests enabled, skip processing for opened/reopened/synchronize
        action = payload.get('action', '')
        if action in ['opened', 'reopened', 'synchronize'] and not preload_repos:
            self.logger.debug(f"Ignoring PR {action}: no repositories have preloadPullRequests enabled")
            return web.json_response({
                "status": "ignored",
                "reason": f"No repositories have preloadPullRequests enabled for action '{action}'"
            }, status=200)
        
        pull_request = payload.get('pull_request', {})
        
        if not isinstance(pull_request, dict):
            return web.json_response({
                "error": "Invalid pull_request field format"
            }, status=400)
        
        pr_number = pull_request.get('number', 0)
        pr_state = pull_request.get('state', '')
        head_ref = pull_request.get('head', {}).get('ref', '')
        base_ref = pull_request.get('base', {}).get('ref', '')
        head_sha = pull_request.get('head', {}).get('sha', '')
        
        self.logger.info(f"PR webhook: repo={repo_full_name}, action={action}, PR#{pr_number}, head={head_ref}, base={base_ref}")
        
        # Only process specific actions
        if action not in ['opened', 'closed', 'reopened', 'synchronize']:
            self.logger.debug(f"Ignoring PR action: {action}")
            return web.json_response({
                "status": "ignored",
                "reason": f"PR action '{action}' not supported"
            }, status=200)
        
        results = []
        # Use preload_repos for actions that require preloadPullRequests, all repos for cleanup
        repos_to_process = preload_repos if action in ['opened', 'reopened', 'synchronize'] else agnosticv_repos
        
        for agnosticv_repo in repos_to_process:
            # SECURITY: Verify webhook signature for this repo
            webhook_secret = await self.get_webhook_secret(agnosticv_repo)
            self.logger.debug(f"PR webhook secret check for {agnosticv_repo.name}: secret_configured={webhook_secret is not None}")
            if not self.verify_github_signature(payload_body, signature, webhook_secret):
                self.logger.warning(f"Invalid PR webhook signature for {agnosticv_repo.name}: signature={signature[:20]}..." if signature else "No signature provided")
                continue
            
            try:
                if action == 'opened':
                    # PR opened - add to tracking (preloadPullRequests already verified)
                    await self.trigger_pr_processing(agnosticv_repo, pr_number, head_ref, head_sha, 'opened')
                    results.append({
                        "repo": agnosticv_repo.name,
                        "pr": pr_number,
                        "action": "added_to_tracking"
                    })
                elif action == 'closed':
                    # PR closed - remove from tracking (all repos, regardless of preloadPullRequests)
                    await self.trigger_pr_cleanup(agnosticv_repo, pr_number, head_ref)
                    results.append({
                        "repo": agnosticv_repo.name,
                        "pr": pr_number,
                        "action": "removed_from_tracking"
                    })
                elif action == 'reopened':
                    # PR reopened - add back to tracking (preloadPullRequests already verified)
                    await self.trigger_pr_processing(agnosticv_repo, pr_number, head_ref, head_sha, 'reopened')
                    results.append({
                        "repo": agnosticv_repo.name,
                        "pr": pr_number,
                        "action": "readded_to_tracking"
                    })
                elif action == 'synchronize':
                    # PR updated - update tracking (preloadPullRequests already verified)
                    await self.trigger_pr_processing(agnosticv_repo, pr_number, head_ref, head_sha, 'updated')
                    results.append({
                        "repo": agnosticv_repo.name,
                        "pr": pr_number,
                        "action": "updated_tracking"
                    })
                        
            except Exception as e:
                self.logger.error(f"Error processing PR {action} for {agnosticv_repo.name}: {e}")
                results.append({
                    "repo": agnosticv_repo.name,
                    "pr": pr_number,
                    "action": "failed",
                    "error": str(e)
                })
        
        if not results:
            return web.json_response({
                "error": "No valid repositories processed (signature verification failed or no preloadPullRequests enabled)"
            }, status=401)
        
        return web.json_response({
            "status": "success",
            "event_type": "pull_request",
            "action": action,
            "pr_number": pr_number,
            "repositories": results
        }, status=200)
    
    async def trigger_pr_processing(self, agnosticv_repo, pr_number, head_ref, head_sha, action):
        """Process a single specific PR for webhook events"""
        try:
            logger = logging.getLogger(f'webhook.{agnosticv_repo.name}.pr{pr_number}')
            logger.info(f"PR {action}: #{pr_number} ({head_ref} -> {head_sha})")
            
            # Process only this specific PR
            async with agnosticv_repo.lock:
                await agnosticv_repo.manage_single_pr(
                    pr_number=pr_number,
                    head_ref=head_ref, 
                    head_sha=head_sha,
                    logger=logger
                )
            
            logger.info(f"PR {action} processing completed for #{pr_number}")
            
        except Exception as e:
            self.logger.error(f"Error processing PR {pr_number}: {e}")
            raise
    
    async def trigger_pr_cleanup(self, agnosticv_repo, pr_number, head_ref):
        """Trigger full PR cleanup when PR is closed - delete components and post comments"""
        try:
            logger = logging.getLogger(f'webhook.{agnosticv_repo.name}.pr{pr_number}')
            logger.info(f"PR closed: #{pr_number} ({head_ref})")
            
            # Find and delete all AgnosticVComponents for this PR
            async with agnosticv_repo.lock:
                # Get all components that belong to this PR
                async for agnosticv_component in AgnosticVComponent.list(namespace=agnosticv_repo.namespace):
                    if (hasattr(agnosticv_component, 'pull_request_number') and 
                        agnosticv_component.pull_request_number == pr_number):
                        
                        logger.info(f"Deleting component {agnosticv_component.name} from closed PR #{pr_number}")
                        
                        # Post deletion comment to GitHub before deleting
                        try:
                            github_token = await agnosticv_repo.get_github_token()
                            if github_token:
                                import aiohttp
                                async with aiohttp.ClientSession() as session:
                                    deletion_message = f"🗑️ **Component `{agnosticv_component.name}` deleted** because PR was closed without merge."
                                    async with session.post(
                                        f"{agnosticv_repo.github_api_base_url}/issues/{pr_number}/comments",
                                        headers={
                                            "Authorization": f"token {github_token}",
                                            "Accept": "application/vnd.github.v3+json",
                                            "Content-Type": "application/json",
                                        },
                                        json={"body": deletion_message},
                                    ) as response:
                                        if response.status == 201:
                                            logger.info(f"Posted deletion comment for component {agnosticv_component.name} to PR #{pr_number}")
                                        else:
                                            logger.warning(f"Failed to post deletion comment to PR #{pr_number}: HTTP {response.status}")
                        except Exception as e:
                            logger.warning(f"Failed to post deletion comment to PR #{pr_number}: {e}")
                        
                        # Delete the component
                        await agnosticv_component.delete()
                
                # Remove from tracking
                pr_key = f"pr-{pr_number}"
                if pr_key in agnosticv_repo.last_pr_commits:
                    del agnosticv_repo.last_pr_commits[pr_key]
                
                # Remove from fetched branches if present
                if head_ref in agnosticv_repo.fetched_branches:
                    agnosticv_repo.fetched_branches.discard(head_ref)
            
            logger.info(f"PR cleanup completed for #{pr_number}")
            
        except Exception as e:
            self.logger.error(f"Error cleaning up PR {pr_number}: {e}")
            raise
    
    async def start_server(self):
        """Start the webhook server"""
        runner = web.AppRunner(self.app)
        await runner.setup()
        
        site = web.TCPSite(runner, '0.0.0.0', self.port)
        await site.start()
        
        self.logger.info(f"Webhook server started on port {self.port}")
        return runner
    
    async def stop_server(self, runner):
        """Stop the webhook server"""
        await runner.cleanup()
        self.logger.info("Webhook server stopped")
