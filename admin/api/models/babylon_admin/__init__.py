from sqlalchemy import (event, DDL)

from .incident import Incident

create_schema_ddl = DDL("""
CREATE SCHEMA IF NOT EXISTS babylon_admin;
""")

event.listen(Incident.__table__, "before_create",
             create_schema_ddl.execute_if(dialect="postgresql"))
