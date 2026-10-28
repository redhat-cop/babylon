from babylon_async.agnosticvcomponent import AgnosticVComponent


def make_component(meta):
    return AgnosticVComponent(client=None, definition={
        "apiVersion": "gpte.redhat.com/v1",
        "kind": "AgnosticVComponent",
        "metadata": {"name": "test.item.prod", "namespace": "babylon-config"},
        "spec": {"definition": {"__meta__": meta}},
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

