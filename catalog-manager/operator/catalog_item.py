from rating import Rating
from babylon import Babylon


class CatalogItem:
    kind = "CatalogItem"
    plural = "catalogitems"
    api_group = Babylon.babylon_domain
    api_version = Babylon.babylon_api_version

    @classmethod
    def from_definition(cls, definition):
        metadata = definition["metadata"]
        return cls(
            annotations=metadata.get("annotations", {}),
            labels=metadata.get("labels", {}),
            meta=metadata,
            name=metadata["name"],
            namespace=metadata["namespace"],
            spec=definition["spec"],
            status=definition.get("status", {}),
            uid=metadata["uid"],
        )

    def __init__(
        self, annotations, labels, meta, name, namespace, spec, status, uid, **_
    ):
        self.annotations = annotations
        self.labels = labels
        self.metadata = meta
        self.name = name
        self.namespace = namespace
        self.spec = spec
        self.status = status
        self.uid = uid

    @property
    def display_name(self):
        return self.annotations.get(Babylon.display_name_annotation, self.name)

    @property
    def rating(self):
        return Rating(
            self.labels.get(Babylon.catalog_item_rating_label, None),
            self.annotations.get(Babylon.catalog_item_total_ratings, 0),
        )

    @property
    def is_disabled(self):
        is_disabled_str = self.labels.get(Babylon.catalog_item_is_disabled_label, "False")
        is_disabled = {"True": True, "False": False}.get(is_disabled_str)
        return is_disabled

    def update_from_definition(self, definition):
        metadata = definition["metadata"]
        self.annotations = metadata.get("annotations", {})
        self.labels = metadata.get("labels", {})
        self.metadata = metadata
        self.spec = definition["spec"]
        self.status = definition.get("status", {})
        self.uid = metadata["uid"]

    async def merge_patch(self, patch):
        definition = await Babylon.custom_objects_api.patch_namespaced_custom_object(
            group=self.api_group,
            name=self.name,
            namespace=self.namespace,
            plural=self.plural,
            version=self.api_version,
            body=patch,
            _content_type="application/merge-patch+json",
        )
        self.update_from_definition(definition)