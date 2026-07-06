# frozen_string_literal: true

# Request-scoped globals (Rails 8 authentication pattern). Set per-request by
# the Authentication concern; reset automatically between requests.
class Current < ActiveSupport::CurrentAttributes
  attribute :session

  # Convenience accessor for the authenticated user, derived from the session.
  def user
    session&.user
  end
end
