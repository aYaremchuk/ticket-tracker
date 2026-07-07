# frozen_string_literal: true

require "rails_helper"

RSpec.describe(TicketEvent) do
  let(:team)  { create(:team) }
  let(:actor) { create(:user) }

  # Run the block with Current.user set, as the Authentication concern does in
  # a real request. Current.set restores the previous value afterwards.
  def with_actor(&)
    Current.set(session: Session.new(user: actor), &)
  end

  describe "validations" do
    it "rejects unknown actions" do
      event = build(:ticket_event, action: "renamed")
      expect(event).not_to(be_valid)
    end

    it "requires field for updated events" do
      event = build(:ticket_event, action: "updated", field: nil)
      expect(event).not_to(be_valid)
    end

    it "allows created events without a field" do
      event = build(:ticket_event, action: "created", field: nil, old_value: nil, new_value: nil)
      expect(event).to(be_valid)
    end
  end

  describe "recording on ticket create" do
    it "records a created event, falling back to created_by outside a request" do
      ticket = create(:ticket, team: team)

      expect(ticket.ticket_events.count).to(eq(1))
      expect(ticket.ticket_events.first).to(have_attributes(
        action: "created",
        actor_id: ticket.created_by_id,
        field: nil,
        old_value: nil,
        new_value: nil,
      ))
    end

    it "uses Current.user as the actor when set" do
      ticket = with_actor { create(:ticket, team: team) }

      expect(ticket.ticket_events.first.actor_id).to(eq(actor.id))
    end
  end

  describe "recording on ticket update" do
    let!(:ticket) { create(:ticket, team: team, title: "Old title", ticket_type: "bug", state: "new") }

    it "records one event per changed tracked field, attributed to Current.user" do
      with_actor { ticket.update!(title: "New title", state: "in_progress") }

      events = ticket.ticket_events.where(action: "updated")
      expect(events.pluck(:field)).to(contain_exactly("title", "state"))

      title_event = events.find_by(field: "title")
      expect(title_event).to(have_attributes(
        actor_id: actor.id,
        old_value: "Old title",
        new_value: "New title",
      ))
    end

    it "exposes ticket_type changes under the API field name 'type'" do
      with_actor { ticket.update!(ticket_type: "fix") }

      event = ticket.ticket_events.find_by(action: "updated")
      expect(event.field).to(eq("type"))
      expect(event.old_value).to(eq("bug"))
      expect(event.new_value).to(eq("fix"))
    end

    it "stores team names rather than ids when the team changes" do
      other = create(:team, name: "Platform")

      with_actor { ticket.update!(team_id: other.id, epic_id: nil) }

      event = ticket.ticket_events.find_by(field: "team")
      expect(event.old_value).to(eq(team.name))
      expect(event.new_value).to(eq("Platform"))
    end

    it "stores the epic title when an epic is assigned" do
      epic = create(:epic, team: team, title: "Login epic")

      with_actor { ticket.update!(epic_id: epic.id) }

      event = ticket.ticket_events.find_by(field: "epic")
      expect(event.old_value).to(be_nil)
      expect(event.new_value).to(eq("Login epic"))
    end

    it "truncates long body values to a preview" do
      with_actor { ticket.update!(body: "x" * 500) }

      event = ticket.ticket_events.find_by(field: "body")
      expect(event.new_value.length).to(eq(TicketEvent::BODY_PREVIEW_LIMIT))
    end

    it "records nothing on a no-op save" do
      expect { with_actor { ticket.update!(title: ticket.title) } }
        .not_to(change { ticket.ticket_events.count })
    end

    it "records nothing without Current.user (non-request context)" do
      expect { ticket.update!(title: "Changed") }
        .not_to(change { ticket.ticket_events.where(action: "updated").count })
    end
  end

  describe "recording on comment add" do
    let!(:ticket) { create(:ticket, team: team) }

    it "records a commented event with the author and a body preview" do
      comment = create(:comment, ticket: ticket, body: "Looks good to me")

      event = ticket.ticket_events.find_by(action: "commented")
      expect(event).to(have_attributes(
        actor_id: comment.author_id,
        field: nil,
        old_value: nil,
        new_value: "Looks good to me",
      ))
    end

    it "does not touch the ticket's modified_at" do
      expect { create(:comment, ticket: ticket) }
        .not_to(change { ticket.reload.modified_at })
    end

    it "does not affect Ticket#modified_by" do
      create(:comment, ticket: ticket)

      expect(ticket.modified_by).to(eq(ticket.created_by))
    end
  end

  describe "recording on comment edit and delete" do
    let!(:ticket)  { create(:ticket, team: team) }
    let!(:comment) { create(:comment, ticket: ticket, body: "Original text") }

    it "records a comment_edited event with old and new previews" do
      comment.update!(body: "Corrected text")

      event = ticket.ticket_events.find_by(action: "comment_edited")
      expect(event).to(have_attributes(
        actor_id: comment.author_id,
        old_value: "Original text",
        new_value: "Corrected text",
      ))
    end

    it "records nothing when an update does not change the body" do
      expect { comment.update!(body: comment.body) }
        .not_to(change { ticket.ticket_events.count })
    end

    it "records a comment_deleted event with the removed body" do
      comment.destroy!

      event = ticket.ticket_events.find_by(action: "comment_deleted")
      expect(event).to(have_attributes(
        actor_id: comment.author_id,
        old_value: "Original text",
        new_value: nil,
      ))
    end

    it "does not touch the ticket's modified_at" do
      expect do
        comment.update!(body: "Changed")
        comment.destroy!
      end.not_to(change { ticket.reload.modified_at })
    end

    it "skips recording when comments die with their ticket" do
      ticket.destroy!

      expect(described_class.where(action: "comment_deleted").count).to(eq(0))
      expect(described_class.count).to(eq(0))
    end
  end

  describe "Ticket#modified_by" do
    let!(:ticket) { create(:ticket, team: team) }

    it "returns the creator when the ticket has never been edited" do
      expect(ticket.modified_by).to(eq(ticket.created_by))
    end

    it "returns the actor of the most recent update event" do
      with_actor { ticket.update!(title: "Edited by actor") }

      expect(ticket.modified_by).to(eq(actor))
    end
  end

  describe "cascade delete" do
    it "removes events when the ticket is deleted" do
      ticket = create(:ticket, team: team)
      with_actor { ticket.update!(state: "done") }

      expect { ticket.destroy! }.to(change(described_class, :count).from(2).to(0))
    end
  end
end
