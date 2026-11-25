import logging

from babylon_async.agnosticvcomponent import AgnosticVComponent


def make_component(components, deployer_type="workloads"):
    return AgnosticVComponent(client=None, definition={
        "apiVersion": "gpte.redhat.com/v1",
        "kind": "AgnosticVComponent",
        "metadata": {"name": "test.item.prod", "namespace": "babylon-config"},
        "spec": {
            "agnosticvRepo": "test-repo",
            "path": "test/item",
            "definition": {"__meta__": {
                "asset_uuid": "8fd9c6e6-6c0e-4f0b-9f9a-5c4c1e0b0000",
                "catalog": {"namespace": "babylon-catalog-prod"},
                "deployer": {"type": deployer_type},
                "components": components,
            }},
        },
    })


def job_vars(component):
    definition = component.get_resource_provider_definition()
    assert definition is not None
    return definition["spec"]["override"]["spec"]["vars"]["job_vars"]


def test_single_writer_named_propagation_expression_unchanged():
    component = make_component([{
        "item": "agd_v2/ocp-cluster-aws-pools",
        "propagate_provision_data": [
            {"name": "openshift_api_url", "var": "openshift_api_url"},
            {"name": "openshift_cluster_admin_token", "var": "openshift_api_key"},
        ],
    }])
    assert job_vars(component)["openshift_api_url"] == \
        "{{provision_data_0.openshift_api_url|default(omit)|object}}"
    assert job_vars(component)["openshift_api_key"] == \
        "{{provision_data_0.openshift_cluster_admin_token|default(omit)|object}}"


def test_single_writer_whole_dict_propagation_expression_unchanged():
    component = make_component([{
        "item": "agd_v2/ocp-cluster-aws-pools",
        "propagate_provision_data": [{"var": "pool_data"}],
    }])
    assert job_vars(component)["pool_data"] == \
        "{{provision_data_0|default(omit)|object}}"


def test_distinct_vars_from_multiple_components_not_merged():
    component = make_component([
        {
            "item": "agd_v2/ocp-cluster-aws-pools",
            "propagate_provision_data": [
                {"name": "openshift_api_url", "var": "base_api_url"},
            ],
        }, {
            "item": "agd_v2/ocp-cluster-aws-virt-pools",
            "propagate_provision_data": [
                {"name": "openshift_api_url", "var": "virt_api_url"},
            ],
        },
    ])
    vars = job_vars(component)
    assert vars["base_api_url"] == \
        "{{provision_data_0.openshift_api_url|default(omit)|object}}"
    assert vars["virt_api_url"] == \
        "{{provision_data_1.openshift_api_url|default(omit)|object}}"


def test_multiple_writers_same_var_merged_conditional_expression():
    component = make_component([
        {
            "item": "agd_v2/ocp-cluster-aws-pools",
            "propagate_provision_data": [
                {"name": "openshift_api_url", "var": "openshift_api_url"},
            ],
        }, {
            "item": "agd_v2/ocp-cluster-aws-virt-pools",
            "propagate_provision_data": [
                {"name": "openshift_api_url", "var": "openshift_api_url"},
            ],
        },
    ])
    assert job_vars(component)["openshift_api_url"] == (
        "{{ (provision_data_1.openshift_api_url|default(omit)"
        " if (current_state_1|default('')) == 'started'"
        " else provision_data_0.openshift_api_url|default(omit)"
        " if (current_state_0|default('')) == 'started'"
        " else omit) | object }}"
    )


def test_multiple_writers_whole_dict_merged_conditional_expression():
    component = make_component([
        {
            "item": "agd_v2/ocp-cluster-aws-pools",
            "propagate_provision_data": [{"var": "pool_data"}],
        }, {
            "item": "agd_v2/ocp-cluster-aws-virt-pools",
            "propagate_provision_data": [{"var": "pool_data"}],
        },
    ])
    assert job_vars(component)["pool_data"] == (
        "{{ (provision_data_1|default(omit)"
        " if (current_state_1|default('')) == 'started'"
        " else provision_data_0|default(omit)"
        " if (current_state_0|default('')) == 'started'"
        " else omit) | object }}"
    )


def test_multiple_writers_later_components_tested_first():
    component = make_component([
        {
            "item": "agd_v2/pool-a",
            "propagate_provision_data": [{"name": "api_url", "var": "api_url"}],
        }, {
            "item": "agd_v2/pool-b",
            "propagate_provision_data": [{"name": "api_url", "var": "api_url"}],
        }, {
            "item": "agd_v2/pool-c",
            "propagate_provision_data": [{"name": "api_url", "var": "api_url"}],
        },
    ])
    assert job_vars(component)["api_url"] == (
        "{{ (provision_data_2.api_url|default(omit)"
        " if (current_state_2|default('')) == 'started'"
        " else provision_data_1.api_url|default(omit)"
        " if (current_state_1|default('')) == 'started'"
        " else provision_data_0.api_url|default(omit)"
        " if (current_state_0|default('')) == 'started'"
        " else omit) | object }}"
    )


def test_multiple_writers_grouped_by_var_not_position():
    # Components 0 and 2 target the same var; component 1 targets another.
    component = make_component([
        {
            "item": "agd_v2/pool-a",
            "propagate_provision_data": [{"name": "api_url", "var": "api_url"}],
        }, {
            "item": "agd_v2/pool-b",
            "propagate_provision_data": [{"name": "other", "var": "other_var"}],
        }, {
            "item": "agd_v2/pool-c",
            "propagate_provision_data": [{"name": "api_url", "var": "api_url"}],
        },
    ])
    assert job_vars(component)["api_url"] == (
        "{{ (provision_data_2.api_url|default(omit)"
        " if (current_state_2|default('')) == 'started'"
        " else provision_data_0.api_url|default(omit)"
        " if (current_state_0|default('')) == 'started'"
        " else omit) | object }}"
    )
    assert job_vars(component)["other_var"] == \
        "{{provision_data_1.other|default(omit)|object}}"


def test_multiple_writers_same_var_logs_warning(caplog):
    component = make_component([
        {
            "item": "agd_v2/ocp-cluster-aws-pools",
            "propagate_provision_data": [
                {"name": "openshift_api_url", "var": "openshift_api_url"},
            ],
        }, {
            "item": "agd_v2/ocp-cluster-aws-virt-pools",
            "propagate_provision_data": [
                {"name": "openshift_api_url", "var": "openshift_api_url"},
            ],
        },
    ])
    with caplog.at_level(logging.WARNING, logger="babylon_async.agnosticvcomponent"):
        job_vars(component)
    warnings = [r for r in caplog.records if r.levelno == logging.WARNING]
    assert len(warnings) == 1
    message = warnings[0].getMessage()
    assert "openshift_api_url" in message
    assert "last running wins" in message


def test_single_writer_same_var_no_warning(caplog):
    component = make_component([
        {
            "item": "agd_v2/ocp-cluster-aws-pools",
            "propagate_provision_data": [
                {"name": "openshift_api_url", "var": "openshift_api_url"},
            ],
        }, {
            "item": "agd_v2/ocp-cluster-aws-virt-pools",
            "propagate_provision_data": [
                {"name": "openshift_api_url", "var": "virt_api_url"},
            ],
        },
    ])
    with caplog.at_level(logging.WARNING, logger="babylon_async.agnosticvcomponent"):
        job_vars(component)
    assert not [r for r in caplog.records if r.levelno == logging.WARNING]


def test_no_propagation_without_deployer_type():
    component = make_component([{
        "item": "agd_v2/ocp-cluster-aws-pools",
        "propagate_provision_data": [
            {"name": "openshift_api_url", "var": "openshift_api_url"},
        ],
    }], deployer_type=None)
    definition = component.get_resource_provider_definition()
    assert definition is not None
    assert "override" not in definition["spec"]
