# frozen_string_literal: true

# Transactional email for the auth flow. The verification link embeds the RAW
# token (the DB stores only its digest) and points at the SPA's /verify route,
# which POSTs the token to /api/verify_email.
class UserMailer < ApplicationMailer
  def verification_email(user, raw_token)
    @user = user
    @verify_url = "#{app_base_url}/verify?token=#{raw_token}"

    mail(to: user.email, subject: "Verify your email")
  end

  private

  def app_base_url
    ENV.fetch("APP_BASE_URL", "http://localhost:8080").sub(%r{/\z}, "")
  end
end
