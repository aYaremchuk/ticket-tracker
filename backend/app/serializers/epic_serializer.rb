# frozen_string_literal: true

# Shapes the public JSON view of an epic per docs/api-contract.md.
# Exposes `modified_at` (contract name) mapped from Rails' `updated_at`.
#
# The optional `ticket_count:` keyword argument allows the index action to pass
# a precomputed grouped count (N+1 fix). When not supplied, the instance method
# is called directly (used by create/update single-record responses).
module EpicSerializer
  extend self

  def call(epic, ticket_count: nil)
    {
      id: epic.id,
      team_id: epic.team_id,
      title: epic.title,
      description: epic.description,
      ticket_count: ticket_count.nil? ? epic.ticket_count : ticket_count,
      created_at: epic.created_at.utc.iso8601,
      modified_at: epic.updated_at.utc.iso8601,
    }
  end
end
