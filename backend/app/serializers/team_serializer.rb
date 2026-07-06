# frozen_string_literal: true

# Shapes the public JSON view of a team per docs/api-contract.md.
# Exposes `modified_at` (contract name) mapped from Rails' `updated_at`.
#
# The optional `ticket_count:` and `epic_count:` keyword arguments allow the
# index action to pass precomputed grouped counts (N+1 fix). When not supplied
# the instance methods are called directly (used by create/update single-record
# responses where N+1 is not a concern).
module TeamSerializer
  extend self

  def call(team, ticket_count: nil, epic_count: nil)
    {
      id: team.id,
      name: team.name,
      ticket_count: ticket_count.nil? ? team.ticket_count : ticket_count,
      epic_count: epic_count.nil?   ? team.epic_count : epic_count,
      created_at: team.created_at.utc.iso8601,
      modified_at: team.updated_at.utc.iso8601,
    }
  end
end
