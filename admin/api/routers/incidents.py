from typing import List
import logging
from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import JSONResponse
from schemas import IncidentSchema, IncidentCreate
from models.babylon_admin import Incident
from models import Database as db
from .router_helper import get_status_params


logger = logging.getLogger('babylon-api')


tags = ["incidents"]

router = APIRouter(tags=tags)


@router.get("/api/admin/v1/incidents",
            response_model=List[IncidentSchema],
            summary="List all incidents by status",
            )
async def incidents_list(status: str = Depends(get_status_params)
                         ) -> List[IncidentSchema]:
    try:
        status_value = status['status']
        if status_value not in ["active", "resolved", "all"]:
            raise HTTPException(status_code=404, detail="Invalid status")

        incidents = await Incident.get_incidents_by_status(status_value)
        if not incidents:
            return JSONResponse(status_code=200, content={"message": "No incidents found"})

        return incidents
    except Exception as e:
        logger.error(f"Error getting incidents: {e}", stack_info=True)
        raise HTTPException(status_code=404, detail="Error getting incidents") from e


@router.post("/api/admin/v1/incidents",
             response_model=IncidentSchema,
             summary="Create incident")
async def create_incident(incident_create: IncidentCreate):
    try:
        new_incident = Incident(**incident_create.dict())
        new_incident = await new_incident.save()
        return new_incident.to_dict(True)
    except Exception as e:
        logger.error(f"Error creating incident: {e}", stack_info=True)
        raise HTTPException(status_code=500, detail="Error creating incident. Contact the administrator") from e


@router.post("/api/admin/v1/incidents/{incident_id}",
             response_model=IncidentSchema,
             summary="Update incident by ID")
async def update_incident(incident_id: int, incident: IncidentCreate):
    try:
        incident_db = await Incident.get_incident_by_id(incident_id)
        if not incident_db:
            raise HTTPException(status_code=404, detail="Incident not found")

        incident_db.status = incident.status
        incident_db.incident_type = incident.incident_type
        incident_db.level = incident.level
        incident_db.message = incident.message
        incident_db = await incident_db.save()
        return incident_db.to_dict(True)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating incident: {e}", stack_info=True)
        raise HTTPException(status_code=500, detail="Error updating incident. Contact the administrator") from e
