import os
import kubernetes_asyncio

from babylon import Babylon
from rating import Rating

class CatalogItem():
    kind = 'CatalogItem'
    plural = 'catalogitems'
    
    def from_definition(self, definition):
        metadata = definition['metadata']
        self.annotations = metadata.get('annotations', {})
        self.labels = metadata.get('labels', {})
        self.metadata = metadata
        self.name = metadata['name']
        self.namespace = metadata['namespace']
        self.spec = definition['spec']
        self.status = definition.get('status', {})
        self.uid = metadata['uid']
    
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

    def update_from_definition(self, definition):
        metadata = definition['metadata']
        self.annotations = metadata.get('annotations', {})
        self.labels = metadata.get('labels', {})
        self.metadata = metadata
        self.spec = definition['spec']
        self.status = definition.get('status', {})
        self.uid = metadata['uid']

    async def set_rating(self, rating, logger):
        try:
            definition = await Babylon.custom_objects_api.patch_namespaced_custom_object(
                group = Babylon.babylon_domain,
                version = Babylon.babylon_api_version,
                namespace = self.namespace,
                plural = self.plural,
                name = self.name,
                body = {
                    "metadata": {
                        "labels": {
                            Babylon.catalog_item_rating_label: str(rating.rating_score)
                        },
                        "annotations": {
                            Babylon.catalog_item_total_ratings: str(rating.total_ratings)
                        }
                    }
                },
                _content_type = 'application/merge-patch+json',
            )
            self.update_from_definition(definition)
        except kubernetes_asyncio.client.rest.ApiException as e:
            logger.warn(f"Error in catalog_item.set_rating: {e}")
            if e.status != 404:
                raise