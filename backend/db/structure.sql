SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: citext; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS citext WITH SCHEMA public;


--
-- Name: EXTENSION citext; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION citext IS 'data type for case-insensitive character strings';


--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


--
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: ar_internal_metadata; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ar_internal_metadata (
    key character varying NOT NULL,
    value character varying,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL
);


--
-- Name: comments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.comments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ticket_id uuid NOT NULL,
    author_id uuid NOT NULL,
    body text NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL
);


--
-- Name: email_verification_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_verification_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    token_digest character varying NOT NULL,
    expires_at timestamp(6) without time zone NOT NULL,
    consumed_at timestamp(6) without time zone,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL
);


--
-- Name: epics; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.epics (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    team_id uuid NOT NULL,
    title character varying NOT NULL,
    description text,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL
);


--
-- Name: schema_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.schema_migrations (
    version character varying NOT NULL
);


--
-- Name: sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    token_digest character varying NOT NULL,
    ip_address character varying,
    user_agent character varying,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL
);


--
-- Name: teams; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.teams (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name public.citext NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL
);


--
-- Name: ticket_number_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ticket_number_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tickets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tickets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    number integer DEFAULT nextval('public.ticket_number_seq'::regclass) NOT NULL,
    team_id uuid NOT NULL,
    epic_id uuid,
    created_by_id uuid NOT NULL,
    ticket_type character varying NOT NULL,
    state character varying DEFAULT 'new'::character varying NOT NULL,
    title character varying NOT NULL,
    body text NOT NULL,
    modified_at timestamp(6) without time zone NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email public.citext NOT NULL,
    password_digest character varying NOT NULL,
    email_verified_at timestamp(6) without time zone,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL
);


--
-- Name: ar_internal_metadata ar_internal_metadata_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ar_internal_metadata
    ADD CONSTRAINT ar_internal_metadata_pkey PRIMARY KEY (key);


--
-- Name: comments comments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comments
    ADD CONSTRAINT comments_pkey PRIMARY KEY (id);


--
-- Name: email_verification_tokens email_verification_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_verification_tokens
    ADD CONSTRAINT email_verification_tokens_pkey PRIMARY KEY (id);


--
-- Name: epics epics_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.epics
    ADD CONSTRAINT epics_pkey PRIMARY KEY (id);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (version);


--
-- Name: sessions sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (id);


--
-- Name: teams teams_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teams
    ADD CONSTRAINT teams_pkey PRIMARY KEY (id);


--
-- Name: tickets tickets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT tickets_pkey PRIMARY KEY (id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: index_comments_on_author_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_comments_on_author_id ON public.comments USING btree (author_id);


--
-- Name: index_comments_on_ticket_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_comments_on_ticket_id ON public.comments USING btree (ticket_id);


--
-- Name: index_email_verification_tokens_on_token_digest; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_email_verification_tokens_on_token_digest ON public.email_verification_tokens USING btree (token_digest);


--
-- Name: index_email_verification_tokens_on_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_email_verification_tokens_on_user_id ON public.email_verification_tokens USING btree (user_id);


--
-- Name: index_email_verification_tokens_on_user_id_and_consumed_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_email_verification_tokens_on_user_id_and_consumed_at ON public.email_verification_tokens USING btree (user_id, consumed_at);


--
-- Name: index_epics_on_team_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_epics_on_team_id ON public.epics USING btree (team_id);


--
-- Name: index_sessions_on_token_digest; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_sessions_on_token_digest ON public.sessions USING btree (token_digest);


--
-- Name: index_sessions_on_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_sessions_on_user_id ON public.sessions USING btree (user_id);


--
-- Name: index_teams_on_name; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_teams_on_name ON public.teams USING btree (name);


--
-- Name: index_tickets_on_created_by_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_tickets_on_created_by_id ON public.tickets USING btree (created_by_id);


--
-- Name: index_tickets_on_epic_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_tickets_on_epic_id ON public.tickets USING btree (epic_id);


--
-- Name: index_tickets_on_modified_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_tickets_on_modified_at ON public.tickets USING btree (modified_at);


--
-- Name: index_tickets_on_number; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_tickets_on_number ON public.tickets USING btree (number);


--
-- Name: index_tickets_on_state; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_tickets_on_state ON public.tickets USING btree (state);


--
-- Name: index_tickets_on_team_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_tickets_on_team_id ON public.tickets USING btree (team_id);


--
-- Name: index_users_on_email; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_users_on_email ON public.users USING btree (email);


--
-- Name: tickets fk_rails_043f0bb452; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT fk_rails_043f0bb452 FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE RESTRICT;


--
-- Name: tickets fk_rails_19630627a5; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT fk_rails_19630627a5 FOREIGN KEY (epic_id) REFERENCES public.epics(id) ON DELETE RESTRICT;


--
-- Name: epics fk_rails_1d7790b8a0; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.epics
    ADD CONSTRAINT fk_rails_1d7790b8a0 FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE RESTRICT;


--
-- Name: email_verification_tokens fk_rails_37a6b0cc74; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_verification_tokens
    ADD CONSTRAINT fk_rails_37a6b0cc74 FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: sessions fk_rails_758836b4f0; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT fk_rails_758836b4f0 FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: comments fk_rails_e013b60ecb; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comments
    ADD CONSTRAINT fk_rails_e013b60ecb FOREIGN KEY (ticket_id) REFERENCES public.tickets(id) ON DELETE CASCADE;


--
-- Name: comments fk_rails_f44b1e3c8a; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comments
    ADD CONSTRAINT fk_rails_f44b1e3c8a FOREIGN KEY (author_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: tickets fk_rails_f694a04b71; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT fk_rails_f694a04b71 FOREIGN KEY (created_by_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- PostgreSQL database dump complete
--

SET search_path TO "$user", public;

INSERT INTO "schema_migrations" (version) VALUES
('20260706190002'),
('20260706190001'),
('20260706180001'),
('20260706170001'),
('20260706160004'),
('20260706160003'),
('20260706160002'),
('20260706160001');

