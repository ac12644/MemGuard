import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.deps import get_db, get_tenant
from src.api.schemas import ValidationJobCreate, ValidationJobResponse, ValidationResultResponse
from src.models.tenant import Tenant
from src.models.validation_job import ValidationJob
from src.models.validation_result import ValidationResult
from src.utils.audit import emit_audit_event

router = APIRouter(prefix="/api/v1/validations", tags=["validations"])


@router.post("", response_model=ValidationJobResponse, status_code=201)
async def create_validation_job(
    body: ValidationJobCreate,
    tenant: Tenant = Depends(get_tenant),
    db: AsyncSession = Depends(get_db),
) -> ValidationJob:
    """Trigger a validation job and run it immediately."""
    from src.engine.validator import run_validation_job

    job = ValidationJob(
        tenant_id=tenant.id,
        connector_id=body.connector_id,
        job_type=body.job_type,
        priority=body.priority,
        config=body.config,
    )
    db.add(job)
    await db.flush()
    await db.refresh(job)
    await emit_audit_event(
        tenant.id, "validation_started", db,
        actor="api:user",
        details={"job_id": str(job.id), "job_type": job.job_type, "priority": job.priority},
    )
    await db.flush()

    # Run inline (Celery worker not required)
    await run_validation_job(job.id, db)
    await db.refresh(job)
    return job


@router.get("", response_model=list[ValidationJobResponse])
async def list_validation_jobs(
    status: str | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    tenant: Tenant = Depends(get_tenant),
    db: AsyncSession = Depends(get_db),
) -> list[ValidationJob]:
    """List validation jobs."""
    query = select(ValidationJob).where(ValidationJob.tenant_id == tenant.id)
    if status:
        query = query.where(ValidationJob.status == status)
    query = query.order_by(ValidationJob.created_at.desc()).limit(limit).offset(offset)
    result = await db.execute(query)
    return list(result.scalars().all())


@router.get("/{job_id}", response_model=ValidationJobResponse)
async def get_validation_job(
    job_id: uuid.UUID,
    tenant: Tenant = Depends(get_tenant),
    db: AsyncSession = Depends(get_db),
) -> ValidationJob:
    """Get job details."""
    job = await db.get(ValidationJob, job_id)
    if not job or job.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Validation job not found")
    return job


@router.get("/{job_id}/results", response_model=list[ValidationResultResponse])
async def get_job_results(
    job_id: uuid.UUID,
    tenant: Tenant = Depends(get_tenant),
    db: AsyncSession = Depends(get_db),
) -> list[ValidationResult]:
    """Get results for a validation job."""
    result = await db.execute(
        select(ValidationResult).where(ValidationResult.job_id == job_id).order_by(ValidationResult.created_at)
    )
    return list(result.scalars().all())


@router.post("/{job_id}/cancel", status_code=200)
async def cancel_validation_job(
    job_id: uuid.UUID,
    tenant: Tenant = Depends(get_tenant),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Cancel a running job."""
    job = await db.get(ValidationJob, job_id)
    if not job or job.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Validation job not found")
    if job.status not in ("pending", "running"):
        raise HTTPException(status_code=400, detail=f"Cannot cancel job in '{job.status}' status")
    job.status = "cancelled"
    await db.flush()
    return {"status": "cancelled", "job_id": str(job_id)}
