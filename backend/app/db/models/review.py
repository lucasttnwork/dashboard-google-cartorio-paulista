"""ORM models for the public.reviews and public.review_labels tables.

Both tables pre-exist in production (baseline migration). The backend
reads them via service_role (RLS deny_all in effect). Phase 3 treats
these as read-only — no INSERT/UPDATE from the backend.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.models.user_profile import Base


class ReviewLabel(Base):
    """1:1 classification labels for a review.

    Maps to the ``review_labels`` table populated by the classifier worker.
    The ``sentiment`` column uses the ``review_sentiment`` enum
    (pos/neu/neg/unknown) defined in the migration.
    """

    __tablename__ = "review_labels"
    __table_args__ = {"schema": "public"}

    review_id: Mapped[str] = mapped_column(
        Text, primary_key=True
    )
    sentiment: Mapped[str | None] = mapped_column(String, nullable=True)
    toxicity: Mapped[float | None] = mapped_column(Float, nullable=True)
    is_enotariado: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    classifier_version: Mapped[str | None] = mapped_column(Text, nullable=True)


class Review(Base):
    """Google Business Profile review.

    Maps to the ``reviews`` table populated by the collection worker.
    Read-only in Phase 3 — the dashboard only queries, never mutates.
    """

    __tablename__ = "reviews"
    __table_args__ = {"schema": "public"}

    review_id: Mapped[str] = mapped_column(Text, primary_key=True)
    location_id: Mapped[str | None] = mapped_column(Text, nullable=True)
    rating: Mapped[int | None] = mapped_column(Integer, nullable=True)
    comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    reviewer_name: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_anonymous: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    create_time: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    update_time: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    reply_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    reply_time: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    review_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    reviewer_id: Mapped[str | None] = mapped_column(Text, nullable=True)
    reviewer_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_local_guide: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    reviewer_photo_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    original_language: Mapped[str | None] = mapped_column(Text, nullable=True)
    translated_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    response_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    response_time: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    source: Mapped[str | None] = mapped_column(Text, nullable=True)
    collection_source: Mapped[str | None] = mapped_column(Text, nullable=True)
    collection_batch_id: Mapped[str | None] = mapped_column(Text, nullable=True)
    processed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    last_checked_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    last_seen_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # --- relationships (read-only, for eager loading) ---

    label: Mapped[ReviewLabel | None] = relationship(
        "ReviewLabel",
        primaryjoin="Review.review_id == foreign(ReviewLabel.review_id)",
        uselist=False,
        lazy="joined",
        viewonly=True,
    )

    mentions: Mapped[list["ReviewCollaborator"]] = relationship(
        "ReviewCollaborator",
        primaryjoin="Review.review_id == foreign(ReviewCollaborator.review_id)",
        lazy="selectin",
        viewonly=True,
    )
