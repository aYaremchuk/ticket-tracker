# frozen_string_literal: true

# A ticket belongs to a team and optionally to an epic within that team.
#
# `number` is auto-assigned from a Postgres sequence on create (gapless-safe
# under concurrent inserts). Displayed as TCK-<number> in the UI.
#
# `ticket_type` maps to the API field `type`; Rails' `type` column is reserved
# for STI. The DB column is `ticket_type`; the enum is declared on that column
# and the serializer exposes it as `type`.
#
# `modified_at` semantics (critical):
#   - Set to current UTC on create.
#   - Advanced ONLY when a real ticket attribute (title, body, ticket_type,
#     state, team_id, epic_id) changes on update.
#   - An unchanged save does NOT advance it.
#   - Adding a comment does NOT touch it (comments never call save on Ticket).
#
# epic_team_mismatch: if an epic is supplied it must belong to the same team.
class Ticket < ApplicationRecord
  TICKET_TYPES = ["bug", "feature", "fix"].freeze
  TICKET_STATES = ["new", "ready_for_implementation", "in_progress", "ready_for_acceptance", "done"].freeze

  # Attributes tracked for modified_at purposes (exclude created_at, updated_at,
  # modified_at itself, and number which is set once on create).
  MODIFIED_TRACKED_ATTRS = ["title", "body", "ticket_type", "state", "team_id", "epic_id"].freeze

  belongs_to :team
  belongs_to :epic, optional: true
  belongs_to :created_by, class_name: "User"

  has_many :comments, dependent: :destroy

  before_validation :strip_fields
  before_create     :set_modified_at
  before_update     :advance_modified_at_if_changed

  validates :title, presence: true
  validates :body,  presence: true
  validates :ticket_type, presence: true, inclusion: { in: TICKET_TYPES, message: "must be bug, feature, or fix" }
  validates :state,       presence: true, inclusion: { in: TICKET_STATES, message: "must be a valid state" }
  validate  :epic_belongs_to_team

  private

  def strip_fields
    self.title = title.strip if title.present?
    self.body  = body.strip  if body.present?
  end

  def set_modified_at
    self.modified_at = Time.current
  end

  # Advance modified_at only when a field that matters semantically has changed.
  # This is evaluated before the UPDATE is issued, so changed? is still true here.
  def advance_modified_at_if_changed
    return unless MODIFIED_TRACKED_ATTRS.any? { |attr| send(:"#{attr}_changed?") }

    self.modified_at = Time.current
  end

  def epic_belongs_to_team
    return if epic_id.blank?

    # We need the epic's team_id. Avoid an extra query if the association is loaded.
    epic_team_id = epic&.team_id || Epic.where(id: epic_id).pick(:team_id)

    # Use the new team_id if it is being changed, otherwise use the current team_id.
    effective_team_id = team_id_changed? ? team_id : (team_id || team&.id)

    if epic_team_id != effective_team_id
      errors.add(
        :epic_id,
        :epic_team_mismatch,
        message: "must belong to the same team as the ticket",
      )
    end
  end
end
