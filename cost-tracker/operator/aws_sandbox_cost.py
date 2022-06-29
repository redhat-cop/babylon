import boto3
import os

from datetime import datetime, timedelta, timezone

boto3_sts_client = boto3.client(
    'sts',
    aws_access_key_id = os.environ.get('AWS_SANDBOX_MANAGER_ACCESS_KEY_ID'),
    aws_secret_access_key = os.environ.get('AWS_SANDBOX_MANAGER_SECRET_ACCESS_KEY'),
)

def get_aws_sandbox_cost(creation_datetime, sandbox_account):
    sandbox_assumed_role = boto3_sts_client.assume_role(
        RoleArn = f"arn:aws:iam::{sandbox_account}:role/OrganizationAccountAccessRole",
        RoleSessionName = f"AssumeRole-{sandbox_account}",
    )
    sandbox_credentials = sandbox_assumed_role['Credentials']
    boto3_ce_client = boto3.client(
        'ce',
        aws_access_key_id = sandbox_credentials['AccessKeyId'],
        aws_secret_access_key = sandbox_credentials['SecretAccessKey'],
        aws_session_token = sandbox_credentials['SessionToken'],
    )
    cost_and_usage = boto3_ce_client.get_cost_and_usage(
        Filter = dict(
            Dimensions = dict(
                Key = 'RECORD_TYPE',
                Values = ['SavingsPlanCoveredUsage', 'Usage']
            )
        ),
        Granularity = 'DAILY',
        Metrics = ['UnblendedCost'],
        TimePeriod = dict(
            Start = creation_datetime.strftime('%F'),
            End = (datetime.now(timezone.utc) + timedelta(days=1)).strftime('%F'),
        )
    )

    total_cost = 0
    for result in cost_and_usage.get('ResultsByTime', []):
        total_cost += float(result['Total']['UnblendedCost']['Amount'])

    return total_cost
