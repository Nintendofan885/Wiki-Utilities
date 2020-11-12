const i18n = require('i18next');
const { Listener } = require('discord-akairo');

class MessageReactionAddListener extends Listener {
    constructor() {
        super('messageReactionAdd', {
            emitter: 'client',
            event: 'messageReactionAdd',
            category: 'client'
        });

        this.check = '✅';
        this.cross = '❌';
        this.loading = '774872461246070795';
    }

    async exec(reaction, user) {
        const config = this.client.config.wiki;
        this.config = config;

        // If server doesn't have RcGcDw extension enabled
        if (!config.rcgcdw_extension.enabled) return;

        // Fetch resources if partial
        if (reaction.partial) await reaction.fetch();
        if (user.partial) await user.fetch();

        const { message, emoji } = reaction;

        // If reaction wasn't in RcGcDw logging channel
        if (!config.rcgcdw_extension.channel_ids.includes(message.channel.id)) return;

        const member = await message.guild.members.fetch(user);

        // If user isn't permitted to take administrative actions
        if (!config.allowed_roles.some(role => member.roles.cache.has(role))
            || config.blacklisted_users.includes(user.id)
        ) return;

        let type;
        for (const [key, value] of Object.entries(this.config.rcgcdw_extension.emojis)) {
            if (!Array.isArray(value)) continue;

            if (value.some(t => t.includes(emoji.name))) {
                type = key;
            }
        }
        if (!type) return;

        const reason = config.user_map.enabled
            && config.user_map[user.id]
        ? i18n.t('handler.listeners.message_reaction_add.rcgcdw_summary', {
            user: `[[User:${config.user_map[user.id]}|${config.user_map[user.id]}]]`
        })
        : i18n.t('handler.listeners.message_reaction_add.rcgcdw_summary', {
            user: user.tag
        });

        switch (type) {
            case 'delete':
                await this.handleDelete(message, user, reason);
                break;
            case 'revert':
                await this.handleRevert(message, user, reason);
                break;
            case 'block':
                await this.handleBlock(message, user, reason);
                break;
        }
    }

    async handleDelete(message, user, reason) {
        let page;

        if (message.content
            && this.config.rcgcdw_extension.mode === 'compact'
        ) {
            page = this.parseCompactContent(message.content, 1);
        }

        if (message.embeds.length
            && message.embeds[0].author.name !== this.config.rcgcdw_extension.wiki_name
            && this.config.rcgcdw_extension.mode === 'embed'
        ) {
            // Remove stuff like (m +69), (-420) and ((N!) 0)
            page = message.embeds[0].title.replace(/\((?:(?:m|\(N!\)) )?[+-]?\d*\)/, '').trim();
        }

        if (!page) return message.react(this.cross);

        await message.react(this.loading);

        try {
            await this.client.bot.login();

            await this.client.bot.delete({
                title: page,
                reason: reason
            });

            await message.react(this.check);
        } catch (err) {
            await message.react(this.cross);
            user.send(
                i18n.t('handler.listeners.message_reaction_add.error_occurred', { error: err.message })
            ).catch(() => {});
        } finally {
            await message.reactions.cache.get(this.loading).remove();
        }
    }

    async handleRevert(message, user, reason) {
        let page;

        if (message.content
        && this.config.rcgcdw_extension.mode === 'compact'
        ) {
            page = this.parseCompactContent(message.content, 1);
        }

        if (message.embeds.length
            && message.embeds[0].author.name !== this.config.rcgcdw_extension.wiki_name
            && this.config.rcgcdw_extension.mode === 'embed'
        ) {
            // Remove stuff like (m +69), (-420) and ((N!) 0)
            page = message.embeds[0].title.replace(/\((?:(?:m|\(N!\)) )?[+-]?\d*\)/, '').trim();
            message.content = message.embeds[0].url;
        }

        const diffRegex = /diff=(\d*)/;
        const diffMatches = diffRegex.exec(message.content);

        if (!diffMatches) return message.react(this.cross);
        const [, diff] = diffMatches;

        await message.react(this.loading);

        try {
            await this.client.bot.login();

            await this.client.bot.undo({
                title: page,
                revision: diff,
                summary: reason
            });

            await message.react(this.check);
        } catch (err) {
            await message.react(this.cross);
            user.send(
                i18n.t('handler.listeners.message_reaction_add.error_occurred', { error: err.message })
            ).catch(() => {});
        } finally {
            await message.reactions.cache.get(this.loading).remove();
        }
    }

    async handleBlock(message, user, reason) {
        let username;

        if (message.content
            && this.config.rcgcdw_extension.mode === 'compact'
        ) {
            username = this.parseCompactContent(message.content, 0);
        }

        if (message.embeds.length
            && message.embeds[0].author.name !== this.config.rcgcdw_extension.wiki_name
            && this.config.rcgcdw_extension.mode === 'embed'
        ) {
            username = message.embeds[0].author.name;
        }

        // Prevent admins trying to block the bot
        // idk why they would, but hey, accidents happen
        if (username === this.config.credentials.username.replace(/@(?:.(?!@))+$/, '')) return message.react('❌');

        await message.react(this.loading);

        try {
            await this.client.bot.login();

            await this.client.bot.block({
                user: username,
                reason: reason,
                expiry: this.config.rcgcdw_extension.block_duration
            });

            await message.react(this.check);
        } catch (err) {
            await message.react(this.cross);
            user.send(
                i18n.t('handler.listeners.message_reaction_add.error_occurred', { error: err.message })
            ).catch(() => {});
        } finally {
            await message.reactions.cache.get(this.loading).remove();
        }
    }

    parseCompactContent(content, positionIndex) {
        const maskedLinkRegex = /\[(.[^)>]+)]/g;

        const arr = [];

        for (const match of content.matchAll(maskedLinkRegex)) {
            arr.push(match);
        }

        return arr[positionIndex][1];
    }
}

module.exports = MessageReactionAddListener;