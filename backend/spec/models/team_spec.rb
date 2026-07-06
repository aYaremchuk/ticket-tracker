# frozen_string_literal: true

require "rails_helper"

RSpec.describe(Team, type: :model) do
  describe "name validation" do
    it "is valid with a name" do
      team = described_class.new(name: "Payments")
      expect(team).to(be_valid)
    end

    it "strips surrounding whitespace before validation" do
      team = described_class.create!(name: "  Payments  ")
      expect(team.name).to(eq("Payments"))
    end

    it "rejects a blank name" do
      team = described_class.new(name: "")
      expect(team).not_to(be_valid)
      expect(team.errors[:name]).to(be_present)
    end

    it "rejects a whitespace-only name" do
      team = described_class.new(name: "   ")
      expect(team).not_to(be_valid)
      expect(team.errors[:name]).to(be_present)
    end

    it "rejects a nil name" do
      team = described_class.new(name: nil)
      expect(team).not_to(be_valid)
      expect(team.errors[:name]).to(be_present)
    end

    it "enforces case-insensitive uniqueness at the model level" do
      described_class.create!(name: "Payments")
      dup = described_class.new(name: "PAYMENTS")
      expect(dup).not_to(be_valid)
      expect(dup.errors.of_kind?(:name, :taken)).to(be(true))
    end

    it "allows teams with different names" do
      described_class.create!(name: "Team Alpha")
      other = described_class.new(name: "Team Beta")
      expect(other).to(be_valid)
    end
  end

  describe "counts" do
    subject(:team) { create(:team) }

    let(:creator) { create(:user) }

    it "ticket_count returns 0 when team has no tickets" do
      expect(team.ticket_count).to(eq(0))
    end

    it "ticket_count reflects actual tickets" do
      create(:ticket, team: team, created_by: creator)
      create(:ticket, team: team, created_by: creator)
      expect(team.ticket_count).to(eq(2))
    end

    it "epic_count returns 0 when team has no epics" do
      expect(team.epic_count).to(eq(0))
    end

    it "epic_count reflects actual epics" do
      create(:epic, team: team)
      create(:epic, team: team)
      expect(team.epic_count).to(eq(2))
    end
  end

  describe "#deletable?" do
    let(:creator) { create(:user) }

    it "returns true when team has no epics or tickets" do
      expect(create(:team).deletable?).to(be(true))
    end

    it "returns false when team has epics" do
      team = create(:team)
      create(:epic, team: team)
      expect(team.deletable?).to(be(false))
    end

    it "returns false when team has tickets" do
      team = create(:team)
      create(:ticket, team: team, created_by: creator)
      expect(team.deletable?).to(be(false))
    end
  end

  describe "delete restriction" do
    let(:creator) { create(:user) }

    it "raises RecordNotDestroyed when team has epics" do
      team = create(:team)
      create(:epic, team: team)
      expect { team.destroy! }.to(raise_error(ActiveRecord::RecordNotDestroyed))
    end

    it "raises RecordNotDestroyed when team has tickets" do
      team = create(:team)
      create(:ticket, team: team, created_by: creator)
      expect { team.destroy! }.to(raise_error(ActiveRecord::RecordNotDestroyed))
    end

    it "destroys successfully when team has no epics or tickets" do
      team = create(:team)
      expect { team.destroy! }.not_to(raise_error)
      expect(described_class.find_by(id: team.id)).to(be_nil)
    end
  end
end
