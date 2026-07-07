# frozen_string_literal: true

# Application user. Passwords are hashed with Argon2id (argon2 gem) rather than
# bcrypt/has_secure_password, per the security spec. A user is "verified" once
# email_verified_at is set via the email-confirmation flow.
class User < ApplicationRecord
  MIN_PASSWORD_LENGTH = 8

  # A fixed Argon2id digest verified against when the email is unknown, so a
  # failed login costs the same wall-clock time whether or not the account
  # exists (no timing-based account enumeration). Value is irrelevant; it just
  # needs to be a real Argon2id hash so verification does the full work.
  DECOY_PASSWORD_DIGEST = Argon2::Password.create("decoy-password-for-timing").freeze

  # Runs a full Argon2id verification against the decoy digest and always
  # returns false. Callers use this on the unknown-email path so timing does
  # not reveal whether an account exists.
  def self.waste_password_comparison(raw)
    Argon2::Password.verify_password(raw.to_s, DECOY_PASSWORD_DIGEST)
    false
  rescue Argon2::Errors::InvalidHash
    false
  end

  has_many :sessions, dependent: :destroy
  has_many :email_verification_tokens, dependent: :destroy
  has_many :password_reset_tokens, dependent: :destroy

  # Normalize before validation so uniqueness/format checks see the trimmed,
  # lower-cased form. The DB column is citext, so this is defense in depth.
  before_validation :normalize_email

  validates :email,
    presence: true,
    uniqueness: { case_sensitive: false },
    format: { with: URI::MailTo::EMAIL_REGEXP }

  validates :password_digest, presence: true
  # Length is validated on the transient :password (see #password=), because the
  # digest itself is always long. We track the raw password for validation only.
  validate :password_length

  # Transient holder for the raw password so length can be validated on create.
  attr_reader :password

  # Sets the Argon2id digest. The raw value is kept only in-memory for
  # validation and never persisted.
  def password=(raw)
    @password = raw
    self.password_digest = raw.present? ? Argon2::Password.create(raw) : nil
  end

  # Constant-time password verification against the stored Argon2id digest.
  def authenticate(raw)
    return false if password_digest.blank?

    Argon2::Password.verify_password(raw, password_digest)
  rescue Argon2::Errors::InvalidHash
    false
  end

  def verified?
    email_verified_at.present?
  end

  def verify!
    update!(email_verified_at: Time.current)
  end

  private

  def normalize_email
    self.email = email.to_s.strip.downcase if email.present?
  end

  def password_length
    return if @password.nil? # unchanged password on update

    if @password.length < MIN_PASSWORD_LENGTH
      errors.add(:password, "must be at least #{MIN_PASSWORD_LENGTH} characters")
    end
  end
end
