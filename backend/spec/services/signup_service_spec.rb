# frozen_string_literal: true

require "rails_helper"

RSpec.describe(SignupService) do
  it "creates an unverified user, issues a token, and sends the email" do
    result = described_class.call(email: "svc@example.com", password: "password123")

    expect(result.success?).to(be(true))
    expect(result.user).to(be_persisted)
    expect(result.user).not_to(be_verified)
    expect(result.user.email_verification_tokens.active.count).to(eq(1))
    expect(ActionMailer::Base.deliveries.size).to(eq(1))
  end

  it "reports email_taken for a duplicate (case-insensitive) email" do
    create(:user, email: "dupe@example.com")
    result = described_class.call(email: "DUPE@example.com", password: "password123")

    expect(result.success?).to(be(false))
    expect(result.error_code).to(eq("email_taken"))
    expect(ActionMailer::Base.deliveries).to(be_empty)
  end

  it "reports validation_error for a short password" do
    result = described_class.call(email: "shortpw@example.com", password: "123")

    expect(result.success?).to(be(false))
    expect(result.error_code).to(eq("validation_error"))
    expect(result.record.errors[:password]).to(be_present)
  end

  it "maps a RecordNotUnique race to email_taken" do
    allow(User).to(receive(:new).and_wrap_original) do |method, *args|
      user = method.call(*args)
      allow(user).to(receive(:valid?).and_return(true))
      allow(user).to(receive(:save).and_raise(ActiveRecord::RecordNotUnique))
      user
    end

    result = described_class.call(email: "race@example.com", password: "password123")
    expect(result.error_code).to(eq("email_taken"))
  end
end
