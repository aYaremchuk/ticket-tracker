# frozen_string_literal: true

# Confirms a password reset: validates the raw token (active/unexpired/unused),
# sets the new Argon2id password (length enforced by the User model), consumes
# the token, and revokes the user's existing sessions so a leaked/old session
# cannot outlive the reset. Returns a Result the controller maps to a status.
#
#   error_code: "token_invalid"    -> 410 (bad/expired/used token)
#   error_code: "validation_error" -> 422 (password too short / invalid)
class PasswordResetService
  Result = Struct.new(:success?, :user, :error_code, :record, keyword_init: true)

  def self.call(token:, password:)
    new(token: token, password: password).call
  end

  def initialize(token:, password:)
    @token = token
    @password = password
  end

  def call
    reset_token = PasswordResetToken.find_active(@token)
    return Result.new(success?: false, error_code: "token_invalid") unless reset_token

    user = reset_token.user
    user.password = @password

    return Result.new(success?: false, error_code: "validation_error", record: user) unless user.valid?

    ActiveRecord::Base.transaction do
      user.save!
      reset_token.consume!
      # Revoke existing sessions: a password reset should log out all devices.
      user.sessions.delete_all
    end

    Result.new(success?: true, user: user)
  end
end
