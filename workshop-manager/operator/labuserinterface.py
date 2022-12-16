class LabUserInterface:
    def __init__(self, definition=None, url=None):
        if definition:
            self.url = definition.get('url')
        else:
            self.url = url

    def serialize(self):
        ret = dict(url=self.url)
        return ret
