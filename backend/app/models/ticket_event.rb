# frozen_string_literal: true

# An immutable activity-history entry for a ticket.
#
# Event kinds:
#   - action = "created":         the ticket was created (field/values nil).
#   - action = "updated":         one tracked field changed (field + old/new values).
#   - action = "commented":       a comment was added (new_value = body preview).
#   - action = "comment_edited":  a comment body changed (old/new previews).
#   - action = "comment_deleted": a comment was removed (old_value = preview).
# Comment events are history only — they never touch the ticket's modified_at,
# and Ticket#modified_by ignores them (filters on "updated").
#
# Values are captured as display text at write time (team name, epic title —
# not ids) so history stays meaningful even if the referenced record is later
# renamed or deleted. Bodies are stored as truncated previews to keep rows small.
class TicketEvent < ApplicationRecord
  ACTIONS = ["created", "updated", "commented", "comment_edited", "comment_deleted"].freeze

  # DB attribute name → the field name exposed by the API (matches the ticket
  # JSON contract, where ticket_type is exposed as `type`).
  API_FIELD_NAMES = {
    "ticket_type" => "type",
    "team_id" => "team",
    "epic_id" => "epic",
  }.freeze

  BODY_PREVIEW_LIMIT = 200

  belongs_to :ticket
  belongs_to :actor, class_name: "User"

  validates :action, presence: true, inclusion: { in: ACTIONS }
  validates :field, presence: true, if: -> { action == "updated" }

  # Resolve a raw attribute value into the display text stored in history.
  def self.display_value(attr, value)
    return if value.nil?

    case attr
    when "team_id" then Team.where(id: value).pick(:name)
    when "epic_id" then Epic.where(id: value).pick(:title)
    when "body"    then value.truncate(BODY_PREVIEW_LIMIT)
    else value
    end
  end
end
