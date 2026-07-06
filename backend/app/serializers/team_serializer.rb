# frozen_string_literal: true

# Shapes the public JSON view of a team per docs/api-contract.md.
# Exposes `modified_at` (contract name) mapped from Rails' `updated_at`.
module TeamSerializer
  extend self

  def call(team)
    {
      id: team.id,
      name: team.name,
      ticket_count: team.ticket_count,
      epic_count: team.epic_count,
      created_at: team.created_at.utc.iso8601,
      modified_at: team.updated_at.utc.iso8601,
    }
  end
end
