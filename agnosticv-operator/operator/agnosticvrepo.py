import os
import re
import yaml

from base64 import b64decode

import aiofiles
import aiofiles.os
import aioshutil
import asyncio
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

class AgnosticVMergeError(AgnosticVProcessingError):
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
        self.git_hexsha = self.git_repo = None
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

    def __git_repo_checkout(self, logger):
        if self.git_ref in self.git_repo.remotes.origin.refs:
            self.git_repo.git.checkout(f"origin/{self.git_ref}")
            if self.git_hexsha != self.git_repo.head.commit.hexsha:
                self.git_hexsha = self.git_repo.head.commit.hexsha
                logger.info(f"Checked out origin/{self.git_ref} [{self.git_hexsha}]")
        elif re.match(r'[0-9a-f]+$', self.git_ref):
            try:
                self.git_repo.git.checkout(self.git_ref)
            except git.exc.GitCommandError:
                raise kopf.TemporaryError(f"Unable to checkout commit {self.git_hexsha}", delay=60)
            if self.git_hexsha != self.git_repo.head.commit.hexsha:
                self.git_hexsha = self.git_repo.head.commit.hexsha
                logger.info(f"Checked out commit {self.git_hexsha}")
        else:
            raise kopf.TemporaryError(f"Unable to resolve reference {self.git_ref}", delay=60)

        if self.last_successful_git_hexsha:
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

    def validate_component_definition(self, path, definition):
        self.validate_execution_environment(
            path = path,
            value = definition['__meta__'].get('deployer', {}).get('execution_environment')
        )

    def validate_execution_environment(self, path, value):
        if not value:
            return
        if 'name' in value:
            if 'image' in value:
                raise AgnosticVComponentValidationError(
                    f"{path}: Execution environment cannot specify both name and image"
                )
            if 'pull' in value:
                raise AgnosticVComponentValidationError(
                    f"{path}: Execution environment cannot specify both name and pull"
                )
            for allow in self.execution_environment_allow_list:
                if 'name' in allow and re.search(allow['name'], value['name']):
                    return
            raise AgnosticVComponentValidationError(f"{path}: Execution environment name not allowed: {value['name']}")
        elif 'image' in value:
            for allow in self.execution_environment_allow_list:
                if 'image' in allow and re.search(allow['image'], value['image']):
                    return
            raise AgnosticVComponentValidationError(f"{path}: Execution environment image not allowed: {value['image']}")
        else:
            raise AgnosticVComponentValidationError(f"{path}: Execution environment requires name or image")

    async def delete_components(self, logger):
        async for agnosticv_component in AgnosticVComponent.list(
            label_selector = f"{Babylon.agnosticv_repo_label}={self.name}",
            namespace = self.namespace,
        ):
            logger.info(f"Propagating delete of {self} to {agnosticv_component}")
            await agnosticv_component.delete()

    async def get_component_definition(self, path, logger):
        proc = await asyncio.create_subprocess_shell(
            f"cd {self.agnosticv_path} && {agnosticv_cli_path} --merge {path}",
            stdout = asyncio.subprocess.PIPE,
            stderr = asyncio.subprocess.PIPE,
        )
        stdout, stderr = await proc.communicate()
        if proc.returncode != 0:
            raise AgnosticVMergeError(f"agnosticv --merge failed for {path}")
        definition = yaml.safe_load(stdout.decode('utf-8'))
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

    async def get_component_paths(self, changed_only, logger):
        agnosticv_cmd = f"cd {self.agnosticv_path} && {agnosticv_cli_path} --list --has __meta__"

        # Add restriction to changed files if requested
        if changed_only and self.git_changed_files:
            agnosticv_cmd += f" --related {self.git_changed_files[0]}"
            for file in self.git_changed_files[1:]:
                agnosticv_cmd += f" --or-related {file}"

        # FIXME - Use create_subprocess_exec instead... need to figure out chdir
        proc = await asyncio.create_subprocess_shell(
            agnosticv_cmd,
            stdout = asyncio.subprocess.PIPE,
            stderr = asyncio.subprocess.PIPE,
        )
        stdout, stderr = await proc.communicate()
        if proc.returncode != 0:
            raise kopf.TemporaryError(
                f"agnosticv --list failed: {stderr.decode('utf-8')}",
                delay=60,
            )
        return stdout.decode('utf-8').split()

    async def get_ssh_key(self):
        secret = await Babylon.core_v1_api.read_namespaced_secret(
            name=self.ssh_key_secret_name,
            namespace=self.namespace
        )
        secret_data = secret.data.get('id_rsa')
        if not secret_data:
            raise kopf.TemporaryError(
                f"Secret {self.ssh_key_secret_name} does not have id_rsa in data",
                delay = 600,
            )
        return b64decode(secret_data)

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
        async with aiofiles.open(self.git_ssh_key_path, mode='wb') as fh:
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

    async def manage_component(self, path, logger):
        name = re.sub(r'\.(json|yaml|yml)$', '', path.lower().replace('_', '-').replace('/', '.'))
        definition = await self.get_component_definition(path=path, logger=logger)

        self.validate_component_definition(path=path, definition=definition)

        try:
            agnosticv_component = await AgnosticVComponent.fetch(name=name, namespace=self.namespace)
            if agnosticv_component.agnosticv_repo != self.name:
                raise AgnosticVConflictError(
                    f"{path} conflicts with {agnosticv_component} from AgnosticVRepo {self.agnosticv_repo}"
                )
            elif agnosticv_component.path != path:
                raise AgnosticVConflictError(
                    f"{path} conflicts with {agnosticv_component} at path {agnosticv_component.path}"
                )
            elif agnosticv_component.definition != definition:
                logger.info(f"Updating {agnosticv_component} definition")
                await agnosticv_component.json_patch([{
                    "op": "add",
                    "path": "/spec/definition",
                    "value": definition,
                }])
            else:
                logger.debug("{agnosticv_component} unchanged")
        except kubernetes_asyncio.client.rest.ApiException as e:
            if e.status == 404:
                logger.info(f"Creating AgnosticVComponent for {path}")
                agnosticv_component = await AgnosticVComponent.create({
                    "metadata": {
                        "labels": {
                            Babylon.agnosticv_repo_label: self.name,
                        },
                        "name": name,
                        "namespace": self.namespace,
                        "ownerReferences": [self.as_owner_ref()],
                    },
                    "spec": {
                        "agnosticvRepo": self.name,
                        "definition": definition,
                        "path": path,
                    }
                })
            else:
                raise

    async def manage_components(self, logger, changed_only=False):
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

        errors = []
        for path in await self.get_component_paths(changed_only=changed_only, logger=logger):
            try:
                await self.manage_component(path=path, logger=logger)
            except AgnosticVProcessingError as error:
                errors.append(error)
        if errors:
            raise kopf.TemporaryError(
                "Error managing components:\n" + "\n".join([str(error) for error in errors]),
                delay = 60,
            )
        await self.merge_patch_status({
            "git": {
                "commit": self.git_hexsha,
            }
        })
        # FIXME - Delete component during full sync
        logger.info(f"Finished managing components for {self.git_hexsha}")
