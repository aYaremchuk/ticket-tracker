# frozen_string_literal: true

require "rails_helper"

RSpec.describe(Session, type: :model) do
  let(:user) { create(:user) }

  describe ".start!" do
    it "creates a session storing a digest, not the raw token" do
      session = described_class.start!(user, ip_address: "1.2.3.4", user_agent: "rspec")
      expect(session.raw_token).to(be_present)
      expect(session.token_digest).to(eq(Digest::SHA256.hexdigest(session.raw_token)))
      expect(session.token_digest).not_to(eq(session.raw_token))
      expect(session.ip_address).to(eq("1.2.3.4"))
    end
  end

  describe ".authenticate" do
    it "returns the session for a valid id + token pair" do
      session = described_class.start!(user)
      expect(described_class.authenticate(session.id, session.raw_token)).to(eq(session))
    end

    it "returns nil for a wrong token" do
      session = described_class.start!(user)
      expect(described_class.authenticate(session.id, "wrong")).to(be_nil)
    end

    it "returns nil for a missing id or token" do
      expect(described_class.authenticate(nil, "x")).to(be_nil)
      expect(described_class.authenticate(SecureRandom.uuid, nil)).to(be_nil)
    end

    it "returns nil for an unknown session id" do
      expect(described_class.authenticate(SecureRandom.uuid, "token")).to(be_nil)
    end
  end
end
