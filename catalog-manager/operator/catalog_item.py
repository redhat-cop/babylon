import os

from babylon import Babylon
from rating import Rating

class CatalogItem():
    kind = 'CatalogItem'
    plural = 'catalogitems'
    
    @classmethod
    def from_definition(cls, definition):
        metadata = definition['metadata']
        return cls(
            annotations = metadata.get('annotations', {}),
            labels = metadata.get('labels', {}),
            meta = metadata,
            name = metadata['name'],
            namespace = metadata['namespace'],
            spec = definition['spec'],
            status = definition.get('status', {}),
            uid = metadata['uid'],
        )
    
    @classmethod
    def from_params(self, annotations, labels, meta, name, namespace, spec, status, uid, **_):
        self.annotations = annotations
        self.labels = labels
        self.metadata = meta
        self.name = name
        self.namespace = namespace
        self.spec = spec
        self.status = status
        self.uid = uid

    def __init__(self, definition=None, **kwargs):
        if definition:
            self.from_definition(definition)
        else:
            self.from_params(**kwargs)

    @property
    def display_name(self):
        return self.annotations.get(Babylon.display_name_annotation, self.name)

    @property
    def rating(self):
        return Rating(self.labels.get(Babylon.catalog_item_rating_label, None), 
        self.annotations.get(Babylon.catalog_item_total_ratings, 0))

    @classmethod
    async def set_rating(self, rating, logger):
        await Babylon.custom_objects_api.patch_namespaced_custom_object(
            group = Babylon.babylon_domain,
            version = Babylon.babylon_api_version,
            namespace = self.namespace,
            plural = self.plural,
            name = self.name,
            _content_type = 'application/merge-patch+json',
            body = {
                "metadata": {
                    "labels": {
                        Babylon.catalog_item_rating_label: rating.rating_score,
                    },
                    "annotations": {
                        Babylon.catalog_item_total_ratings: rating.total_ratings,
                    }
                }
            }
        )
        self.labels = {**self.labels, **{ Babylon.catalog_item_rating_label: rating_score }}
        self.annotations = {**self.annotations, **{ Babylon.catalog_item_total_ratings: total_ratings }}
