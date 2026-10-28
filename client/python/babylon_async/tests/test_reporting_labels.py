import asyncio

from babylon_async.agnosticvcomponent import AgnosticVComponent
from babylon_async.catalogitem import CatalogItem


def make_component(meta):
    return AgnosticVComponent(client=None, definition={
        "apiVersion": "gpte.redhat.com/v1",
        "kind": "AgnosticVComponent",
        "metadata": {"name": "test.item.prod", "namespace": "babylon-config"},
        "spec": {"definition": {"__meta__": meta}},
    })


def make_catalog_item(labels):
    return CatalogItem(client=None, definition={
        "apiVersion": "babylon.gpte.redhat.com/v1",
        "kind": "CatalogItem",
        "metadata": {
            "name": "test.item.prod",
            "namespace": "babylon-catalog-prod",
            "annotations": {},
            "labels": labels,
        },
        "spec": {},
    })


def test_reporting_labels_from_catalog_reporting_labels():
    component = make_component({
        "catalog": {
            "reportingLabels": {
                "primaryBU": "Hybrid Platforms",
                "secondaryBU": "Artificial_Intelligence",
            },
        },
    })
    assert component.reporting_labels == {
        "primaryBU": "Hybrid_Platforms",
        "secondaryBU": "Artificial_Intelligence",
    }


def test_reporting_labels_empty_when_not_set():
    assert make_component({"catalog": {}}).reporting_labels == {}


def test_update_from_agnosticv_removes_stale_reporting_labels():
    catalog_item = make_catalog_item({
        "demo.redhat.com/primaryBU": "Application_Developer",
        "demo.redhat.com/secondaryBU": "Hybrid_Platforms",
        "other.example.com/keep": "yes",
    })
    definition = {
        "metadata": {
            "annotations": {},
            "labels": {"demo.redhat.com/primaryBU": "Hybrid_Platforms"},
        },
        "spec": {},
    }
    captured = {}

    async def replace_definition(updated):
        captured.update(updated)
    catalog_item.replace_definition = replace_definition

    assert asyncio.run(catalog_item.update_from_agnosticv(definition))
    assert captured["metadata"]["labels"] == {
        "demo.redhat.com/primaryBU": "Hybrid_Platforms",
        "other.example.com/keep": "yes",
    }
