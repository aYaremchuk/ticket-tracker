# frozen_string_literal: true

require "rails_helper"

RSpec.describe(User, type: :model) do
  describe "email normalization and validation" do
    it "trims and downcases the email before saving" do
      user = described_class.create!(email: "  Alice@Example.COM ", password: "password123")
      expect(user.email).to(eq("alice@example.com"))
    end

    it "rejects a blank email" do
      user = described_class.new(email: "", password: "password123")
      expect(user).not_to(be_valid)
      expect(user.errors[:email]).to(be_present)
    end

    it "rejects a malformed email" do
      user = described_class.new(email: "not-an-email", password: "password123")
      expect(user).not_to(be_valid)
      expect(user.errors[:email]).to(be_present)
    end

    it "enforces case-insensitive uniqueness" do
      described_class.create!(email: "dup@example.com", password: "password123")
      dup = described_class.new(email: "DUP@example.com", password: "password123")
      expect(dup).not_to(be_valid)
      expect(dup.errors.of_kind?(:email, :taken)).to(be(true))
    end
  end

  describe "password" do
    it "requires at least 8 characters" do
      user = described_class.new(email: "short@example.com", password: "1234567")
      expect(user).not_to(be_valid)
      expect(user.errors[:password]).to(be_present)
    end

    it "accepts exactly 8 characters" do
      user = described_class.new(email: "ok@example.com", password: "12345678")
      expect(user).to(be_valid)
    end

    it "stores an Argon2id digest, not the raw password" do
      user = described_class.create!(email: "hash@example.com", password: "password123")
      expect(user.password_digest).to(start_with("$argon2id$"))
      expect(user.password_digest).not_to(include("password123"))
    end

    it "verifies the correct password and rejects a wrong one" do
      user = described_class.create!(email: "auth@example.com", password: "password123")
      expect(user.authenticate("password123")).to(be(true))
      expect(user.authenticate("wrong")).to(be(false))
    end

    it "returns false from authenticate when no digest is present" do
      expect(described_class.new.authenticate("anything")).to(be(false))
    end
  end

  describe "#verified? / #verify!" do
    it "is unverified until verify! is called" do
      user = create(:user, :unverified)
      expect(user).not_to(be_verified)
      user.verify!
      expect(user.reload).to(be_verified)
    end
  end
end
