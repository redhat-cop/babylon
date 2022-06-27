class AnarchySubject:
    def __init__(self, definition):
        self.definition = definition

    @property
    def aws_sandbox_account(self):
        return self.job_vars.get('sandbox_account')

    @property
    def guid(self):
        return self.job_vars.get('guid')

    @property
    def job_vars(self):
        return self.vars.get('job_vars', {})

    @property
    def metadata(self):
        return self.definition['metadata']

    @property
    def name(self):
        return self.metadata['name']

    @property
    def namespace(self):
        return self.metadata['namespace']

    @property
    def spec(self):
        return self.definition['spec']

    @property
    def vars(self):
        return self.spec.get('vars', {})
