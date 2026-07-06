# frozen_string_literal: true

# A single-use, time-limited email verification token. Only the SHA-256 digest
# is stored; the raw token is delivered solely in the emailed link. Valid means
# unconsumed and unexpired.
class EmailVerificationToken < ApplicationRecord
  TTL = 24.hours

  belongs_to :user

  attr_reader :raw_token

  scope :unused, -> { where(consumed_at: nil) }
  scope :active, -> { unused.where("expires_at > ?", Time.current) }

  # Issues a fresh token for the user, invalidating (consuming) any prior unused
  # tokens so only the newest link works. Returns the token with #raw_token set.
  def self.issue!(user)
    transaction do
      user.email_verification_tokens.unused.update_all(consumed_at: Time.current)

      raw = SecureRandom.urlsafe_base64(32)
      token = create!(
        user: user,
        token_digest: digest(raw),
        expires_at: TTL.from_now,
      )
      token.instance_variable_set(:@raw_token, raw)
      token
    end
  end

  # Finds an active (unused + unexpired) token by its raw value, or nil.
  def self.find_active(raw_token)
    return if raw_token.blank?

    active.find_by(token_digest: digest(raw_token))
  end

  def self.digest(raw)
    Digest::SHA256.hexdigest(raw)
  end

  def expired?
    expires_at <= Time.current
  end

  def consumed?
    consumed_at.present?
  end

  def consume!
    update!(consumed_at: Time.current)
  end
end
