# frozen_string_literal: true

require "rails_helper"

RSpec.describe(EmailVerificationToken, type: :model) do
  let(:user) { create(:user, :unverified) }

  describe ".issue!" do
    it "returns a token whose raw value maps to the stored digest" do
      token = described_class.issue!(user)
      expect(token.raw_token).to(be_present)
      expect(token.token_digest).to(eq(Digest::SHA256.hexdigest(token.raw_token)))
    end

    it "sets a 24h expiry" do
      token = described_class.issue!(user)
      expect(token.expires_at).to(be_within(5.seconds).of(24.hours.from_now))
    end

    it "invalidates prior unused tokens (reissue)" do
      first = described_class.issue!(user)
      described_class.issue!(user)

      expect(first.reload.consumed_at).to(be_present)
      expect(described_class.find_active(first.raw_token)).to(be_nil)
    end
  end

  describe ".find_active" do
    it "finds an unconsumed, unexpired token" do
      token = described_class.issue!(user)
      expect(described_class.find_active(token.raw_token)).to(eq(token))
    end

    it "does not find an expired token" do
      token = described_class.issue!(user)
      token.update!(expires_at: 1.second.ago)
      expect(described_class.find_active(token.raw_token)).to(be_nil)
    end

    it "does not find a consumed (single-use) token" do
      token = described_class.issue!(user)
      token.consume!
      expect(described_class.find_active(token.raw_token)).to(be_nil)
    end

    it "returns nil for a blank or unknown token" do
      expect(described_class.find_active(nil)).to(be_nil)
      expect(described_class.find_active("nope")).to(be_nil)
    end
  end

  describe "#expired? / #consumed?" do
    it "reports expiry and consumption state" do
      token = described_class.issue!(user)
      expect(token).not_to(be_expired)
      expect(token).not_to(be_consumed)

      token.update!(expires_at: 1.second.ago)
      expect(token).to(be_expired)

      token.consume!
      expect(token).to(be_consumed)
    end
  end
end
