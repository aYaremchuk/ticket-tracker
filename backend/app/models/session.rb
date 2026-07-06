# frozen_string_literal: true

# A server-side session. The browser holds a signed HttpOnly cookie containing
# only { session_id, token }; the token is compared against token_digest here.
# Storing a digest (not the raw token) means a DB leak cannot be replayed as a
# valid cookie.
class Session < ApplicationRecord
  belongs_to :user

  # Set by .start!; the raw token is returned once so the controller can place
  # it in the cookie. It is never stored in the clear.
  attr_reader :raw_token

  # Creates a session for the user and returns it with #raw_token populated.
  def self.start!(user, ip_address: nil, user_agent: nil)
    raw = SecureRandom.urlsafe_base64(32)
    session = create!(
      user: user,
      token_digest: digest(raw),
      ip_address: ip_address,
      user_agent: user_agent,
    )
    session.instance_variable_set(:@raw_token, raw)
    session
  end

  # Looks up a session by id and verifies the presented raw token in a way that
  # resists timing attacks. Returns the Session or nil.
  def self.authenticate(id, raw_token)
    return if id.blank? || raw_token.blank?

    session = find_by(id: id)
    return unless session

    expected = session.token_digest
    actual = digest(raw_token)
    session if ActiveSupport::SecurityUtils.secure_compare(expected, actual)
  end

  def self.digest(raw)
    Digest::SHA256.hexdigest(raw)
  end
end
