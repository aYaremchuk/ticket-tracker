# Rails 8.1 API — single-stage image tuned for the hackathon compose setup.
FROM ruby:4.0.5-slim

# System deps: build toolchain for native gems (pg, argon2, bootsnap),
# libpq for PostgreSQL, plus curl for healthchecks.
RUN apt-get update -qq && \
    apt-get install --no-install-recommends -y \
      build-essential \
      libpq-dev \
      postgresql-client \
      libyaml-dev \
      git \
      curl && \
    rm -rf /var/lib/apt/lists/*

ENV RAILS_ENV=development \
    BUNDLE_PATH=/usr/local/bundle \
    LANG=C.UTF-8

WORKDIR /app

# Install gems first so this layer is cached until the Gemfile changes.
COPY Gemfile Gemfile.lock* ./
RUN bundle install

# App source.
COPY . .

# Entry point prepares the DB (migrate, no seed) then execs the given command.
ENTRYPOINT ["./bin/docker-entrypoint"]

EXPOSE 3000
CMD ["bundle", "exec", "puma", "-C", "config/puma.rb"]
