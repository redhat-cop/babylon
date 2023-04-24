import json
import os
import re
import traceback

from base64 import b64decode
from copy import deepcopy
from datetime import datetime, timezone

import aiofiles
import aiofiles.os
import aiohttp
import aioshutil
import asyncio
import functools
import git
import kopf
import kubernetes_asyncio
import pytimeparse

from babylon import Babylon
from agnosticvcomponent import AgnosticVComponent
from cachedkopfobject import CachedKopfObject

# Add aiofiles wrapping for chmod
aiofiles.os.chmod = aiofiles.os.wrap(os.chmod)

agnosticv_cli_path = os.environ.get('AGNOSTICV_CLI_PATH', '/opt/app-root/bin/agnosticv')

class AgnosticVProcessingError(Exception):
    pass

class AgnosticVComponentValidationError(AgnosticVProcessingError):
    pass

class AgnosticVConflictError(AgnosticVProcessingError):
    pass

class AgnosticVExecError(AgnosticVProcessingError):
    pass

class AgnosticVRepo(CachedKopfObject):
    api_group = Babylon.agnosticv_api_group
    api_version = f"{Babylon.agnosticv_api_group}/{Babylon.agnosticv_version}"
    kind = 'AgnosticVRepo'
    plural = 'agnosticvrepos'
    version = Babylon.agnosticv_version

    git_base_path = '/opt/app-root/git'
    cache = {}

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.git_hexsha = self.git_checkout_ref = self.git_repo = None
        self.git_changed_files = []

    @property
    def agnosticv_path(self):
        if 'contextDir' in self.spec:
            return os.path.join(self.git_repo_path, self.spec['contextDir'])
        return self.git_repo_path

    @property
    def anarchy_collections(self):
        return self.spec.get('babylonAnarchyCollections')

    @property
    def anarchy_roles(self):
        return self.spec.get('babylonAnarchyRoles', [{
            "name": "babylon_anarchy_governor",
            "src": "https://github.com/rhpds/babylon_anarchy_governor.git",
            "version": "main"
        }])

    @property
    def catalog_url(self):
        return self.spec.get('catalogUrl')

    @property
    def context_dir(self):
        return self.spec.get('contextDir')

    @property
    def default_execution_environment(self):
        return self.spec.get('default_execution_environment')

    @property
    def execution_environment_allow_list(self):
        return (
            Babylon.execution_environment_allow_list +
            self.spec.get('execution_environment_allow_list_extra', [])
        )

    @property
    def git_env(self):
        env = {}
        if self.ssh_key_secret_name:
            # FIXME - known_hosts should be configurable
            env['GIT_SSH_COMMAND'] = (
                f"ssh -i {self.git_ssh_key_path} "
                f"-o UserKnownHostsFile=/opt/app-root/.ssh/known_hosts"
            )
        return env

    @property
    def git_ref(self):
        return self.spec.get('ref')

    @property
    def github_api_base_url(self):
        if self.git_url.startswith('git@github.com:'):
            if self.git_url.endswith('.git'):
                return f"https://api.github.com/repos/{self.git_url[15:-4]}"
            else:
                return f"https://api.github.com/repos/{self.git_url[15:]}"
        else:
            raise kopf.TemporaryError(f"Unable to determine GitHub base url!", delay=600)

    @property
    def github_preload_pull_requests(self):
        return 'preloadPullRequests' in self.spec.get('gitHub', {})

    @property
    def github_preload_pull_requests_mode(self):
        return self.spec.get('gitHub', {}).get('preloadPullRequests', {}).get('mode')

    @property
    def github_token_secret_name(self):
        return self.spec.get('gitHub', {}).get('tokenSecret')

    @property
    def git_repo_path(self):
        return os.path.join(self.git_base_path, self.name)

    @property
    def git_ssh_key_path(self):
        if self.ssh_key_secret_name:
            return os.path.join(self.git_base_path, self.name + '.sshkey')

    @property
    def git_url(self):
        return self.spec['url']

    @property
    def last_successful_git_hexsha(self):
        return self.status.get('git', {}).get('commit')

    @property
    def polling_interval(self):
        return pytimeparse.parse(
            self.spec.get('pollingInterval', Babylon.default_polling_interval)
        )

    @property
    def ssh_key_secret_name(self):
        return self.spec.get('sshKey')

    def __git_changed_files_in_branch(self, logger, ref=None):
        merge_base = self.git_repo.git.merge_base('origin/' + self.git_ref, 'origin/' + ref)
        return self.git_repo.git.diff(merge_base, 'origin/' + ref, name_only=True).split()

    def __git_repo_checkout(self, logger, ref=None, source=None):
        if not ref:
            ref = source.ref if source else self.git_ref

        if ref in self.git_repo.remotes.origin.refs:
            self.git_repo.git.checkout(f"origin/{ref}")
            hexsha = self.git_repo.head.commit.hexsha
            message = f"Checked out origin/{ref} [{hexsha}]"
        elif re.match(r'[0-9a-f]+$', ref):
            try:
                self.git_repo.git.checkout(ref)
            except git.exc.GitCommandError:
                raise kopf.TemporaryError(f"Unable to checkout commit {self.git_hexsha}", delay=60)
            hexsha = self.git_repo.head.commit.hexsha
            message = f"Checked out {ref}"
        else:
            raise kopf.TemporaryError(f"Unable to resolve reference {ref}", delay=60)

        self.git_checkout_ref = ref
        if source:
            if source.hexsha != hexsha:
                source.hexsha = hexsha
                if source.pull_request_number:
                    logger.info(f"{message} for PR #{source.pull_request_number}")
            return

        if self.git_hexsha != hexsha:
            self.git_hexsha = hexsha
            logger.info(message)

        if self.last_successful_git_hexsha != hexsha:
            git_diff_output = self.git_repo.git.diff(
                self.last_successful_git_hexsha, name_only=True
            )
            if git_diff_output:
                self.git_changed_files = git_diff_output.split("\n")
        else:
            self.git_changed_files = []

    def __git_repo_clone(self, logger):
        self.git_repo = git.Repo.clone_from(
            env = self.git_env,
            to_path = self.git_repo_path,
            url = self.git_url,
        )
        self.__git_repo_checkout(logger=logger)

    def __git_repo_pull(self, logger):
        if not self.git_repo:
            self.git_repo = git.Repo(self.git_repo_path)
        with self.git_repo.git.custom_environment(**self.git_env):
            self.git_repo.remotes.origin.fetch()
        self.__git_repo_checkout(logger=logger)

    def validate_component_definition(self, definition, source):
        self.validate_execution_environment(
            source = source,
            value = definition['__meta__'].get('deployer', {}).get('execution_environment')
        )

    def validate_execution_environment(self, source, value):
        if not value:
            return
        if 'name' in value:
            if 'image' in value:
                raise AgnosticVComponentValidationError(
                    f"{source}: Execution environment cannot specify both name and image"
                )
            if 'pull' in value:
                raise AgnosticVComponentValidationError(
                    f"{source}: Execution environment cannot specify both name and pull"
                )
            for allow in self.execution_environment_allow_list:
                if 'name' in allow and re.search(allow['name'], value['name']):
                    return
            raise AgnosticVComponentValidationError(f"{source}: Execution environment name not allowed: {value['name']}")
        elif 'image' in value:
            for allow in self.execution_environment_allow_list:
                if 'image' in allow and re.search(allow['image'], value['image']):
                    return
            raise AgnosticVComponentValidationError(f"{source}: Execution environment image not allowed: {value['image']}")
        else:
            raise AgnosticVComponentValidationError(f"{source}: Execution environment requires name or image")

    async def agnosticv_exec(self, *cmd):
        proc = await asyncio.create_subprocess_exec(
            agnosticv_cli_path, *cmd,
            stdout = asyncio.subprocess.PIPE,
            stderr = asyncio.subprocess.PIPE,
        )
        stdout, stderr = await proc.communicate()
        if stderr:
            raise AgnosticVExecError(
                "agnosticv execution failed.\n" +
                f"agnosticv {' '.join(cmd)}\n" +
                stderr.decode('utf-8')
            )
        return stdout.decode('utf-8'), stderr.decode('utf-8')

    async def agnosticv_get_all_component_paths(self):
        stdout, stderr = await self.agnosticv_exec(
            '--list', '--has=__meta__', '--dir', self.agnosticv_path
        )
        return stdout.split(), stderr

    async def agnosticv_get_component_paths_from_related_files(self, files):
        if not files:
            return [], ''
        args = ['--related', files[0]]
        for file in files[1:]:
            args.extend(['--or-related', file])
        stdout, stderr = await self.agnosticv_exec(
            '--list', '--has=__meta__', '--dir', self.agnosticv_path, *args
        )
        return stdout.split(), stderr

    async def delete_components(self, logger):
        async for agnosticv_component in AgnosticVComponent.list(
            label_selector = f"{Babylon.agnosticv_repo_label}={self.name}",
            namespace = self.namespace,
        ):
            logger.info(f"Propagating delete of {self} to {agnosticv_component}")
            await agnosticv_component.delete()

    async def get_component_definition(self, source, logger):
        if self.git_checkout_ref != source.ref:
            await self.git_repo_checkout(logger=logger, source=source)
        source.hexsha = self.git_hexsha

        stdout, stderr = await self.agnosticv_exec(
            '--merge', os.path.join(self.agnosticv_path, source.path), '--output=json',
        )
        definition = json.loads(stdout)
        if self.anarchy_collections:
            definition['__meta__'].setdefault('anarchy', {})['collections'] = self.anarchy_collections
        definition['__meta__'].setdefault('anarchy', {})['roles'] = self.anarchy_roles

        # Set default exection environment for controller and disable if set without controller.
        if definition['__meta__'].get('ansible_control_plane', {}).get('type') == 'controller':
            if (
                self.default_execution_environment and
                not definition['__meta__'].get('deployer', {}).get('execution_environment')
            ):
                definition['__meta__'].setdefault('deployer', {})['execution_environment'] = self.default_execution_environment
        #elif definition['__meta__'].get('deployer', {}).get('execution_environment'):
        #    del definition['__meta__']['deployer']['execution_environment']

        return definition

    async def get_component_sources(self, changed_only, logger):
        # Add restriction to changed files if requested
        try:
            if changed_only and self.git_changed_files:
                component_paths, error_msg = await self.agnosticv_get_component_paths_from_related_files(self.git_changed_files)
            else:
                component_paths, error_msg = await self.agnosticv_get_all_component_paths()
        except AgnosticVProcessingError as error:
            raise Kopf.TemporaryError(
                f"{error}",
                delay = 60,
            )

        # Base list of component sources by path
        component_sources_by_path = {
            path: ComponentSource(path, ref=self.git_ref) for path in component_paths
        }

        # Collect all non-fatal error messages
        error_messages = [error_msg] if error_msg else []

        if self.github_preload_pull_requests:
            github_token = await self.get_github_token()
            pull_requests = []
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    f"{self.github_api_base_url}/pulls",
                    headers = {
                        "Accept": "application/vnd.github+json",
                        "Authorization": "Bearer " + github_token,
                        "X-GitHub-Api-Version": "2022-11-28",
                    }
                ) as response:
                    pull_requests = await response.json()
                    pull_requests.reverse()
                    for pull_request in pull_requests:
                        ref = pull_request['head']['ref']
                        await self.git_repo_checkout(logger=logger, ref=ref)
                        changed_files = await self.git_changed_files_in_branch(logger=logger, ref=ref)
                        component_paths, pr_error_msg = await self.agnosticv_get_component_paths_from_related_files(changed_files)
                        if pr_error_msg:
                            error_messages.append(
                                f"Failed to list all components for PR #{pull_request['number']} {ref}:\n{pr_error_msg}\n"
                            )
                        else:
                            for path in component_paths:
                                component_sources_by_path[path] = ComponentSource(
                                    path, pull_request_number=pull_request['number'], ref=ref
                                )

        component_sources = list(component_sources_by_path.values())
        component_sources.sort(key=lambda cs: cs.sortkey)
        return component_sources, error_messages

    async def get_github_token(self):
        secret = await Babylon.core_v1_api.read_namespaced_secret(
            name = self.github_token_secret_name,
            namespace = self.namespace
        )
        secret_data = secret.data.get('token')
        if not secret_data:
            raise kopf.TemporaryError(
                f"Secret {self.github_token_secret_name} does not have token in data",
                delay = 600,
            )
        return b64decode(secret_data).decode('utf-8')

    async def get_ssh_key(self):
        secret = await Babylon.core_v1_api.read_namespaced_secret(
            name = self.ssh_key_secret_name,
            namespace = self.namespace
        )
        secret_data = secret.data.get('id_rsa')
        if not secret_data:
            raise kopf.TemporaryError(
                f"Secret {self.ssh_key_secret_name} does not have id_rsa in data",
                delay = 600,
            )
        return b64decode(secret_data).decode('utf-8')

    async def git_changed_files_in_branch(self, logger, ref):
        return await asyncio.get_event_loop().run_in_executor(
            None, self.__git_changed_files_in_branch, logger, ref
        )

    async def git_repo_checkout(self, logger, ref=None, source=None):
        await asyncio.get_event_loop().run_in_executor(
            None, functools.partial(
                self.__git_repo_checkout, logger=logger, ref=ref, source=source
            )
        )

    async def git_repo_delete(self, logger):
        try:
            await aioshutil.rmtree(self.git_repo_path)
        except FileNotFoundError:
            pass
        try:
            await aiofiles.os.unlink(self.git_ssh_key_path)
        except FileNotFoundError:
            pass

    async def git_repo_sync(self, logger):
        if self.ssh_key_secret_name:
            await self.git_ssh_key_write()
        if await aiofiles.os.path.exists(self.git_repo_path):
            await asyncio.get_event_loop().run_in_executor(
                None, self.__git_repo_pull, logger
            )
        else:
            await asyncio.get_event_loop().run_in_executor(
                None, self.__git_repo_clone, logger
            )

    async def git_ssh_key_write(self):
        await aiofiles.os.makedirs(self.git_base_path, exist_ok=True)
        async with aiofiles.open(self.git_ssh_key_path, mode='w') as fh:
            await fh.write(await self.get_ssh_key())
        await aiofiles.os.chmod(self.git_ssh_key_path, 0o600)

    async def handle_create(self, logger):
        await self.manage_components(logger=logger)

    async def handle_delete(self, logger):
        await self.git_repo_delete(logger=logger)
        await self.delete_components(logger=logger)

    async def handle_resume(self, logger):
        await self.manage_components(logger=logger)

    async def handle_update(self, logger):
        await self.manage_components(logger=logger)

    async def manage_component(self, source, logger):
        definition = await self.get_component_definition(source=source, logger=logger)

        self.validate_component_definition(definition=definition, source=source)

        try:
            agnosticv_component = await AgnosticVComponent.fetch(name=source.name, namespace=self.namespace)
            if agnosticv_component.agnosticv_repo != self.name:
                raise AgnosticVConflictError(
                    f"{source} conflicts with {agnosticv_component} from AgnosticVRepo {self.agnosticv_repo}"
                )
            elif agnosticv_component.path != source.path:
                raise AgnosticVConflictError(
                    f"{source} conflicts with {agnosticv_component} at path {agnosticv_component.path}"
                )

            patch = []
            if agnosticv_component.definition != definition:
                patch.append({
                    "op": "add",
                    "path": "/spec/definition",
                    "value": definition,
                })

            if source.pull_request_number:
                if source.pull_request_number != agnosticv_component.pull_request_number:
                    patch.append({
                        "op": "add",
                        "path": "/spec/pullRequestNumber",
                        "value": source.pull_request_number,
                    })
            elif agnosticv_component.pull_request_number:
                patch.append({
                    "op": "remove",
                    "path": "/spec/pullRequestNumber",
                })

            if patch:
                logger.info(f"Updating {agnosticv_component} definition for {source}")
                await agnosticv_component.json_patch(patch)
                return "updated"

            logger.debug("{agnosticv_component} unchanged")
            return "unchanged"

        except kubernetes_asyncio.client.rest.ApiException as e:
            if e.status == 404:
                logger.info(f"Creating AgnosticVComponent for {source}")
                spec = {
                    "agnosticvRepo": self.name,
                    "definition": definition,
                    "path": source.path,
                }
                agnosticv_component = await AgnosticVComponent.create({
                    "metadata": {
                        "labels": {
                            Babylon.agnosticv_repo_label: self.name,
                        },
                        "name": source.name,
                        "namespace": self.namespace,
                        "ownerReferences": [self.as_owner_ref()],
                    },
                    "spec": spec,
                })
                return "created"
            else:
                raise

    async def manage_components(self, logger, changed_only=False):
        try:
            await self.__manage_components(changed_only=changed_only, logger=logger)
        except AgnosticVProcessingError as error:
            await self.merge_patch_status({
                "error": {
                    "message": str(error),
                    "timestamp": datetime.now(timezone.utc).strftime('%FT%TZ'),
                }
            })
            logger.error(str(error))
        except Exception as error:
            logger.exception("manage_components failed with unexpected error.")
            await self.merge_patch_status({
                "error": {
                    "message": traceback.format_exeception(error),
                    "timestamp": datetime.now(timezone.utc).strftime('%FT%TZ'),
                }
            })

    async def __manage_components(self, logger, changed_only):
        await self.git_repo_sync(logger=logger)

        if changed_only:
            if self.git_hexsha == self.last_successful_git_hexsha:
                logger.debug(f"Unchanged [{self.git_hexsha}]")
                return
            elif self.last_successful_git_hexsha:
                logger.info(f"Updating components from {self.last_successful_git_hexsha} to {self.git_hexsha}")
            else:
                logger.info(f"Initial processing for {self.git_hexsha}")
        else:
            logger.info(f"Starting full component processing for {self.git_hexsha}")

        messages = {}
        pr_hexsha = {}
        errors = {}
        component_sources, get_component_sources_error_messages = await self.get_component_sources(changed_only=changed_only, logger=logger)
        for source in component_sources:
            try:
                result = await self.manage_component(source=source, logger=logger)
                if source.pull_request_number:
                    pr_hexsha[source.pull_request_number] = source.hexsha
                if result == 'created':
                    messages.setdefault(source.pull_request_number, []).append(
                        f"Created AgnosticVComponent {source.name}"
                    )
                elif result == 'updated':
                    messages.setdefault(source.pull_request_number, []).append(
                        f"Updated AgnosticVComponent {source.name}"
                    )
            except AgnosticVProcessingError as error:
                errors.setdefault(source.pull_request_number, []).append(error)

        github_token = None
        for pull_request_number, prerrors in errors.items():
            if not pull_request_number:
                continue
            if not github_token:
                github_token = await self.get_github_token()
            message = "Error applying pull request for integration:\n" + "\n".join(
                [str(error) for error in prerrors]
            )

            async with aiohttp.ClientSession() as session:
                await session.post(
                    f"{self.github_api_base_url}/issues/{pull_request_number}/comments",
                    headers = {
                        "Accept": "application/vnd.github+json",
                        "Authorization": "Bearer " + github_token,
                        "X-GitHub-Api-Version": "2022-11-28",
                    },
                    json = {"body": message},
                )

        for pull_request_number, prmessages in messages.items():
            if not pull_request_number or pull_request_number in errors:
                continue
            if not github_token:
                github_token = await self.get_github_token()
            message = (
                f"Successfully applied revision {pr_hexsha[pull_request_number]} " +
                "for integration testing this pull request.\n\n" +
                "\n".join(prmessages)
            )
            if self.catalog_url:
                message += f"\n\nThe updated catalog is available at {self.catalog_url}"

            async with aiohttp.ClientSession() as session:
                await session.post(
                    f"{self.github_api_base_url}/issues/{pull_request_number}/comments",
                    headers = {
                        "Accept": "application/vnd.github+json",
                        "Authorization": "Bearer " + github_token,
                        "X-GitHub-Api-Version": "2022-11-28",
                    },
                    json = {"body": message}
                )
                await session.post(
                    f"{self.github_api_base_url}/issues/{pull_request_number}/labels",
                    headers = {
                        "Accept": "application/vnd.github+json",
                        "Authorization": "Bearer " + github_token,
                        "X-GitHub-Api-Version": "2022-11-28",
                    },
                    json = {"labels": ["integration"]}
                )

        if errors or get_component_sources_error_messages:
            error_messages = deepcopy(get_component_sources_error_messages)
            raise AgnosticVProcessingError(
                "\n".join(
                    get_component_sources_error_messages +
                    [str(error) for prerrors in errors.values() for error in prerrors]
                )
            )

        await self.merge_patch_status({
            "error": None,
            "git": {
                "commit": self.git_hexsha,
            }
        })

        # FIXME - Delete components during full sync

        logger.info(f"Finished managing components for {self.git_hexsha}")


class ComponentSource:
    def __init__(self, path, ref, pull_request_number=None):
        self.hexsha = None
        self.name = re.sub(r'\.(json|yaml|yml)$', '', path.lower().replace('_', '-').replace('/', '.'))
        self.path = path
        self.pull_request_number = pull_request_number
        self.ref = ref
        self.sortkey = f"{pull_request_number or 0:09d} {path}"

    def __str__(self):
        if self.pull_request_number:
            return f"{self.path} [PR {self.pull_request_number}]"
        else:
            return self.path
