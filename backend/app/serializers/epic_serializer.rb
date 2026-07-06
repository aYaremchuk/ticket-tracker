# frozen_string_literal: true

# Shapes the public JSON view of an epic per docs/api-contract.md.
# Exposes `modified_at` (contract name) mapped from Rails' `updated_at`.
# `ticket_count` is a stub (0) until M4 adds the tickets table.
module EpicSerializer
  extend self

  def call(epic)
    {
      id: epic.id,
      team_id: epic.team_id,
      title: epic.title,
      description: epic.description,
      ticket_count: epic.ticket_count,
      created_at: epic.created_at.utc.iso8601,
      modified_at: epic.updated_at.utc.iso8601,
    }
  end
end
