# frozen_string_literal: true

# Registers a new (unverified) user, issues a 24h verification token, and sends
# the verification email. Returns a Result exposing the created user or the
# reason for failure so the controller can map the correct status code.
class SignupService
  Result = Struct.new(:success?, :user, :error_code, :record, keyword_init: true)

  def self.call(email:, password:)
    new(email: email, password: password).call
  end

  def initialize(email:, password:)
    @email = email
    @password = password
  end

  def call
    user = User.new(email: @email, password: @password)

    # Distinguish "already registered" (409) from other validation errors (422)
    # by checking uniqueness explicitly before save.
    if user.valid? == false && duplicate_email?(user)
      return Result.new(success?: false, error_code: "email_taken", record: user)
    end

    return Result.new(success?: false, error_code: "validation_error", record: user) unless user.save

    token = EmailVerificationToken.issue!(user)
    UserMailer.verification_email(user, token.raw_token).deliver_later

    Result.new(success?: true, user: user)
  rescue ActiveRecord::RecordNotUnique
    # Lost the race against a concurrent signup with the same email.
    Result.new(success?: false, error_code: "email_taken", record: user)
  end

  private

  def duplicate_email?(user)
    user.errors.of_kind?(:email, :taken)
  end
end
