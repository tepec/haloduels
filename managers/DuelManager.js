const Duellists             = require('../crud/Duellists')
const Duels                 = require('../crud/Duels')
const generateEmbed         = require('../utils/generateEmbed')
const { STATUS, RESULT }    = require('../utils/enums.js') 

const newDuelImg = [
    'https://i.imgur.com/0hq7YUV.gif',
    'https://i.imgur.com/Cy1fHmm.gif',
    'https://i.imgur.com/w4I6kcA.gif',
    'https://media.discordapp.net/attachments/443844498074632192/669650500463099934/ezgif.com-video-to-gif9.gif'
]
const endResultGif = [
    'https://media.discordapp.net/attachments/443844498074632192/674203710909579264/halfjaw-speech.gif',
    'https://media.discordapp.net/attachments/572511139632775204/679346631178715146/giphy.gif',
    'https://media.discordapp.net/attachments/614835042023112707/675388268598263822/ezgif.com-video-to-gif_14.gif'
]

class DuelManager {
    constructor (duelGuild, translations) { 
        this.duellists          = new Duellists(duelGuild, translations) 
        this.duels              = new Duels(duelGuild, translations) 
        this.duelGuild          = duelGuild 
        this.$t                 = translations
    }

    async attack (message) {
        const duel = this.duels.getById(message.channel.id)
        if (!duel) {
            const mainChannel = await message.client.channels.fetch(this.duelGuild.mainChanId)
            return message.channel.send(this.$t.get('errorWrongChannel', { prefix: this.duelGuild.prefix, mainChannel })).catch(process.dLogger.log)
        }
        if (duel.busy) 
            return message.delete()
        
        duel.busy           = true
        this.duels.update(duel)
        const round         = this.duels.generateNewRound(duel, message.author.id)
        
        const winner        = duel.duellists.find(d => d.duellist.id === round.winner)
        const winnerMember  = await message.guild.members.fetch(round.winner)
        const embed         = generateEmbed({
            title       : this.$t.get('playerDominatesThisRound', { player: winner.duellist.displayName.toUpperCase() }),
            color       : winner.color === 'red' ? '#fa1212' : '#1da1f2',
            description : round.statement,
            thumbnail   : winnerMember.user.avatarURL({ format: 'jpg', dynamic: true, size: 128 }),
            image       : round.image
        })
        const offender = this.duellists.getById(message.author.id)
        message.channel.send(this.$t.get('offenderAttacks', { player: offender.displayName }))
            .then(() => {
                message.channel
                    .send(embed)
                    .then(async () => {
                        const loserBonus    = duel.bonuses.find(b => b.receiverId !== round.winner && b.bonus.worksIf === RESULT.DEFEAT && b.bonus.type === round.type) 
                        const loser         = duel.duellists.find(d => d.duellist.id !== round.winner)
                        const loserMember   = await message.guild.members.fetch(loser.duellist.id)

                        if (loserBonus) {
                            const bonusEmbed    = generateEmbed({
                                title       : this.$t.get('defeatBonus', { player: loser.duellist.displayName.toUpperCase() }),
                                thumbnail   : loserMember.user.avatarURL({ format: 'jpg', dynamic: true, size: 128 }),
                                color       : loser.color === 'red' ? '#fa1212' : '#1da1f2',
                                description : this.$t.get(loserBonus.bonus.key, { donator: loserBonus.donorName, duellist: loser.duellist.displayName, opponent: winner.duellist.displayName }),
                                image       : loserBonus.bonus.image
                            })
                            setTimeout(() => {
                                message.channel
                                .send(bonusEmbed)
                                .then(() => {
                                    const duelWithWinner = this.duels.newRoundDone(duel, round, loserBonus)
                                    setTimeout(() => {
                                        message.channel.send(this._genEndRoundEmbed(duelWithWinner))
                                        .then(() => {
                                            this._newRoundOrEndGame(message, duelWithWinner)
                                        })
                                        .catch(process.dLogger.log)
                                    }, 2000)
                                })
                                .catch(process.dLogger.log)
                            }, 2000)
                        } else {
                            const winnerBonus = duel.bonuses.find(b => b.receiverId === round.winner && b.bonus.worksIf === RESULT.VICTORY && b.bonus.type === round.type) 
                            
                            if (winnerBonus) {
                                const bonusEmbed    = generateEmbed({
                                    title       : this.$t.get('taunt'),
                                    thumbnail   : winnerMember.user.avatarURL({ format: 'jpg', dynamic: true, size: 128 }),
                                    color       : winner.color === 'red' ? '#fa1212' : '#1da1f2',
                                    description : this.$t.get(winnerBonus.bonus.key, { donator: winnerBonus.donorName, duellist: winner.duellist.displayName, opponent: loser.duellist.displayName }), 
                                    image       : winnerBonus.bonus.image
                                })
                                setTimeout(() => {
                                    message.channel
                                    .send(bonusEmbed)
                                    .then(() => {
                                        const duelWithWinner = this.duels.newRoundDone(duel, round, winnerBonus)
                                        setTimeout(() => {
                                            message.channel.send(this._genEndRoundEmbed(duelWithWinner))
                                                .then(() => {
                                                    this._newRoundOrEndGame(message, duelWithWinner)
                                                })
                                                .catch(process.dLogger.log)
                                        })
                                    })
                                    .catch(process.dLogger.log)
                                }, 2000)
                            } else {
                                const duelWithWinner = this.duels.newRoundDone(duel, round)
                                setTimeout(() => {
                                    message.channel.send(this._genEndRoundEmbed(duelWithWinner))
                                        .then(() => {
                                            this._newRoundOrEndGame(message, duelWithWinner)
                                        })
                                        .catch(process.dLogger.log)
                                }, 2000)
                            }
                        }
                    })
            })
    }

    async challenge (message) {
        let offender = this.duellists.getById(message.author.id)

        if (!offender) 
            offender = await this.enlist(message)
        
        switch (offender.status) {
            case STATUS.FIGHTING: 
            return message.channel.send(this.$t.get('errorAlreadyInADuel'))
                break 
            case STATUS.WAITING_DUEL_APPROVAL:
                return message.channel.send(this.$t.get('errorPendingDuel'))
                break 
            default:
                break
        }

        const defenderMember = message.mentions.members.first() 
        if (!defenderMember) 
            return message.channel.send(this.$t.get('errorCantFindOpponent'))
        
        let defenderDuellist = this.duellists.getById(defenderMember.id)
        if (!defenderDuellist) {
            defenderDuellist = this.duellists.add(defenderMember, true)
        }
        if (defenderDuellist.status !== STATUS.IDLE) 
            return message.channel.send(this.$t.get('errorOpponentInADuel'))
        
        if (offender.id === defenderMember.id) 
            return message.channel.send(this.$t.get('errorCantAutoChallenge'))

        const accept    = '🤺'
        const decline   = '🚷'
        const embed     = generateEmbed({
            title       : this.$t.get('newChallenge'),
            thumbnail   : 'https://i.imgur.com/G6Bpy9x.png', 
            description : this.$t.get('newChallengeDesc', { defender: defenderMember, offender: offender.displayName, accept, decline }),
            image       : 'https://i.imgur.com/H6ZsESX.gif'
        })
        const mainChannel   = await message.client.channels.fetch(this.duelGuild.mainChanId)
        mainChannel.send(embed)
            .then(msg => {
                offender.status = STATUS.WAITING_DUEL_APPROVAL
                this.duellists.update(offender)

                msg.react(accept)
                msg.react(decline)
                msg.awaitReactions(
                    (reaction, user) => [accept, decline].includes(reaction.emoji.name) && user.id === defenderMember.id, 
                    { 
                        max     : 1, 
                        time    : (5 * 60000), 
                        errors  : ['time'] 
                    }
                )
                    .then(async collected => {
                        const reaction  = collected.first()
                        let answer      = ''

                        if (reaction.emoji.name === accept) {
                            try { 
                                if (defenderDuellist.tmp) {
                                    defenderDuellist.tmp    = false 
                                    this.duellists.update(defenderDuellist)
                                    let rulesChannel        = null 
                                    if (this.duelGuild.rulesChanId) 
                                        rulesChannel = await message.client.channels.fetch(this.duelGuild.rulesChanId)
                                    
                                    const embed = generateEmbed({
                                        description : this.$t.get('newChallengerDesc', { player: defenderMember }), 
                                        thumbnail   : defenderMember.user.avatarURL({ format: 'jpg', dynamic: true, size: 128 }), 
                                        title       : this.$t.get('newChallenger'), 
                                        fields      : [
                                            { name: this.$t.get('howToPlay'), value: !!rulesChannel ? this.$t.get('howToPlayDescRulesChan', { rulesChannel }) : this.$t.get('howToPlayDesc', { prefix: this.duelGuild.prefix, cmdHelp: this.$t.get('cmdHelp') }) },
                                            { name: this.$t.get('whereToPlay'), value: this.$t.get('whereToPlayDesc', { mainChannel }) }
                                        ]
                                    })
                                    mainChannel.send(embed)
                                        .catch(process.dLogger.log)
                                }
                                this._setupNewDuel(
                                    { discordUser: message.author, duelUser: offender }, 
                                    { discordUser: defenderMember.user, duelUser: defenderDuellist }, 
                                    message
                                )
                            } catch (err) {
                                message.channel.send(err.message)
                            }
                        } else {
                            offender.status = STATUS.IDLE
                            this.duellists.update(offender)
                            if (defenderDuellist.tmp) 
                                this.duellists.unset(defenderDuellist.id)
                            
                            message.channel.send(this.$t.get('challengeDeclined', { player: message.author, opponent: defenderMember.displayName }))
                        }
                    })
                    .catch(err => {
                        offender.status = STATUS.IDLE
                        this.duellists.update(offender)
                        if (defenderDuellist.tmp) 
                            this.duellists.unset(defenderDuellist.id)

                        msg.channel.send(this.$t.get('errorOpponentTimeout', { player: message.author, opponent: defenderDuellist.displayName }))
                    })
            })
    }

    getDuelById (duelId) {
        return this.duels.getById(duelId)
    }

    async enlist (message) {
        const discordGuild = message.guild
        try {
            const member        = await discordGuild.members.fetch(message.author)
            const duellist      = this.duellists.add(member)
            const mainChannel   = await message.client.channels.fetch(this.duelGuild.mainChanId)
            let rulesChannel    = null 

            if (this.duelGuild.rulesChanId) 
                rulesChannel = await message.client.channels.fetch(this.duelGuild.rulesChanId)
            
            const embed = generateEmbed({
                description : this.$t.get('newChallengerDesc', { player: member }), 
                thumbnail   : message.author.avatarURL({ format: 'jpg', dynamic: true, size: 128 }), 
                title       : this.$t.get('newChallenger'), 
                fields      : [
                    { name: this.$t.get('howToPlay'), value: !!rulesChannel ? this.$t.get('howToPlayDescRulesChan', { rulesChannel }) : this.$t.get('howToPlayDesc', { prefix: this.duelGuild.prefix, cmdHelp: this.$t.get('cmdHelp') }) },
                    { name: this.$t.get('whereToPlay'), value: this.$t.get('whereToPlayDesc', { mainChannel }) }
                ]
            })
            message.channel.send(embed)
                .catch(process.dLogger.log)

            return duellist
        } catch (err) {
            message.channel.send(err.message)
                .catch(process.dLogger.log)
        }
    }

    getStatsForUser (message) {
        const duellist = this.duellists.getById(message.author.id)
        if (!duellist)
            return message.channel.send(this.$t.get('errorCantFindInDuellistList'))
        
        let ratio = '' 
        if (duellist.stats.victories + duellist.stats.defeats > 0)
            ratio = `${Math.round((duellist.stats.victories/(duellist.stats.victories + duellist.stats.defeats))*10000)/100}%`
        else 
            ratio = `N/A`

        const localeCodes   = {
            en: 'en-US', 
            fr: 'fr-FR'
        }
        let victoriesLabel  = this.$t.get('victories', {}, 2)
        let defeatsLabel    = this.$t.get('defeats', {}, 2)
        victoriesLabel      = victoriesLabel.charAt(0).toUpperCase() + victoriesLabel.slice(1)
        defeatsLabel        = defeatsLabel.charAt(0).toUpperCase() + defeatsLabel.slice(1)
        const embed = generateEmbed({
            color       : '#43b581',
            description : this.$t.get('letsSeeIfYouCanFlex'),
            fields      : [
                { name: this.$t.get('registration'), value : new Date(duellist.enroledAt).toLocaleDateString(localeCodes[this.duelGuild.locale || 'en']), inline: true },
                { name: this.$t.get('lastDuel'), value : duellist.lastDuel ? new Date(duellist.lastDuel).toLocaleDateString(localeCodes[this.duelGuild.locale || 'en']) : 'N/A', inline: true },
                { name: this.$t.get('nbDuels'), value : duellist.stats.victories + duellist.stats.defeats, inline: false },
                { name: victoriesLabel, value : duellist.stats.victories, inline: true },
                { name: defeatsLabel, value : duellist.stats.defeats, inline: true },
                { name: this.$t.get('ratio'), value : ratio, inline: true }
            ],
            footer      : this.$t.get('statsGeneratedOnDate', { date: new Date().toLocaleDateString(localeCodes[this.duelGuild.locale ||'en']) }), 
            title       : this.$t.get('playersStats', { player : duellist.displayName }),
            thumbnail   :  message.author.avatarURL({ format: 'jpg', dynamic: true, size: 128 })
        })

        message.channel.send(embed)
            .catch(process.dLogger.log)
    }

    listDuellists (message) {
        const duellists = this.duellists.all().filter(d => !d.tmp)
        const sorted    = duellists.sort((a, b) => {
            if (a.stats.victories > b.stats.victories) 
                return -1 
            else if (b.stats.victories < b.stats.victories) 
                return 1 
            else 
                return 0
        })

        let prevNumber  = 1
        let prevCount   = 0
        const fields    = []
        sorted.forEach((duellist, index) => {
            if (index === 0) 
                prevCount = (duellist.stats.victories - duellist.stats.defeats)
            else if (index >= 10)
                return 

            const number    = (duellist.stats.victories - duellist.stats.defeats) === prevCount ? prevNumber : prevNumber + 1
            prevCount       = (duellist.stats.victories - duellist.stats.defeats)
            prevNumber      = number 
            let rank        = ''
            switch (number) {
                case 1: 
                    rank = `${number}. 🥇`
                    break
                case 2: 
                    rank = `${number}. 🥈`
                    break
                case 3: 
                    rank = `${number}. 🥉`
                    break
                default: 
                    rank = `${number}.`
                    break
            }
            let ratio   = '' 
            const total = duellist.stats.victories + duellist.stats.defeats
            if (total > 0)
                ratio = `${Math.round((duellist.stats.victories/(total))*10000)/100}%`
            else 
                ratio = this.$t.get('noFight')

            fields.push({ name: `**${rank} ${duellist.displayName}**`, value: `${duellist.stats.victories} ${this.$t.get('victories', {}, duellist.stats.victories)} | ${total} ${this.$t.get('duels', {}, total)} (${ratio})` })
        })

        try {
            const embed = generateEmbed({
                title       : this.$t.get('duellistsLeaderboard'),
                thumbnail   : 'https://i.imgur.com/G6Bpy9x.png', 
                color       : '#43b581', 
                description : this.$t.get('duellistsLeaderboardDesc'),
                fields
            })

            message.channel.send(embed)
                .catch(process.dLogger.log)
        } catch (err) {
            message.channel.send(err.message)
                .catch(process.dLogger.log)
        }
    }
    
    nickname (message, arg) {
        const duellist = this.duellists.getById(message.author.id)
        if (!duellist)
            return message.channel.send(this.$t.get('errorCantFindInDuellistList'))

        try {
            duellist.displayName = arg.trim()
            this.duellists.update(duellist)
            message.channel.send(this.$t.get('nicknameChanged', { name: duellist.displayName }))
        } catch (err) {
            message.channel.send(err.message)
                .catch(process.dLogger.log)
        }
    }

    rageQuit (message) {
        let answer      = ''
        const confirm   = '✅'
        const cancel    = '❎'
        message.channel
            .send(this.$t.get('confirmRagequit', { confirm, cancel }))
            .then(msg => {
                msg.react(confirm)
                msg.react(cancel)
                msg.awaitReactions(
                    (reaction, user) => [confirm, cancel].includes(reaction.emoji.name) && user.id === message.author.id, 
                    { 
                        max     : 1, 
                        time    : (5 * 60000), 
                        errors  : ['time'] 
                    }
                )
                    .then(collected => {
                        const reaction  = collected.first()

                        if (reaction.emoji.name === confirm) {
                            // 1. mettre à jour les stats des joueurs (forcer la victoire à celui qui n'a pas quitté)
                            // 2. passer le duel en "hasEnded"
                            // 3. passer les duellistes en "idle"
                            const duel = this.duels.getById(message.channel.id)
                            if (!duel)
                                return 
                            duel.duellists.forEach(d => {
                                if (d.duellist.id === message.author.id)
                                    d.duellist.stats.defeats += 1
                                else 
                                    d.duellist.stats.victories += 1
                                
                                d.duellist.status = STATUS.IDLE
                                this.duellists.update(d.duellist)
                            })
                            duel.hasEnded = true 
                            this.duels.update(duel)
                            message.channel.delete()
                                .then(async () => {
                                    const winner = duel.duellists.find(d => d.duellist.id !== message.author.id)
                                    const looser = duel.duellists.find(d => d.duellist.id === message.author.id)
                                    const fields = []
                                    duel.duellists.forEach(d => {
                                        const countVictories    = duel.count.roundWinners.filter(id => id === d.duellist.id).length
                                        let niceDots            = countVictories > 0 ? '' : '-'
                                        for (let i = 0; i < countVictories; i++)
                                            niceDots += d.color === 'red' ? '🟥 ' : '🟦 '
                                        fields.push({
                                            name    : d.duellist.displayName,
                                            value   : niceDots,
                                            inline  : true
                                        })
                                    })
                                    const winnerDiscordUser = await message.client.users.fetch(winner.duellist.id)
                                    const mainChannel       = await message.client.channels.fetch(this.duelGuild.mainChanId)
                                    mainChannel.send(generateEmbed({
                                        color       : '#43b581',
                                        description : this.$t.get('ragequitDescription', { player: looser.duellist.displayName, opponent: winner.duellist.displayName }),
                                        fields,
                                        thumbnail   : winnerDiscordUser.avatarURL({ format: 'jpg', dynamic: true, size: 128 }),
                                        title       : this.$t.get('ragequitTitle', { player: looser.duellist.displayName.toUpperCase(), opponent: winner.duellist.displayName.toUpperCase() }),
                                    }))
                                    this.duels.endDuel(duel)
                                })
                                .catch(process.dLogger.log)
                        } else
                            answer = this.$t.get('goodCancel')

                        message.channel.send(answer)
                    })
                    .catch(process.dLogger.log)
            })
    }
    
    async resetDailyGiftsForAll (message) {
        const duellists = this.duellists.all()
        duellists.forEach(d => {
            if (d.dailyGifts.length < 2) {
                d.dailyGifts = [...d.dailyGifts, ...d.genDailyGifts()]
                this.duellists.update(d)
            }
        })

        const chan      = message.guild.channels.resolve(this.duelGuild.mainChanId)
        const lastMsg   = await chan.lastMessage

        if (lastMsg.author.bot && lastMsg.content.startsWith(this.$t.get('newDayForGifts')))
            lastMsg.delete().then(() => chan.send(this.$t.get('newDayForGifts')))
        else 
            chan.send(this.$t.get('newDayForGifts'))
    }

    retire (message) {
        let answer      = ''
        const confirm   = '✅'
        const cancel    = '❎'
        message.channel
            .send(this.$t.get('confirmRetire', { confirm, cancel }))
            .then(msg => {
                msg.react(confirm)
                msg.react(cancel)      
                msg.awaitReactions(
                    (reaction, user) => [confirm, cancel].includes(reaction.emoji.name) && user.id === message.author.id, 
                    { 
                        max     : 1, 
                        time    : (5 * 60000), 
                        errors  : ['time'] 
                    }
                )
                    .then(collected => {
                        const reaction  = collected.first()
                        if (reaction.emoji.name === confirm) { 
                            try {
                                const duellist = this.duellists.getById(message.author.id)
                                if (duellist.status !== STATUS.IDDLE) 
                                    answer = this.$t.get('errorCantRetire')
                                else {
                                    this.duellists.unset(message.author.id)
                                    answer = `Bye bye ${duellist.displayName}`
                                }
                                this.duellists.unset(message.author.id)
                            } catch (err) {
                                answer = err.message
                            } 
                        } else
                            answer = this.$t.get('goodCancel')

                        message.channel.send(answer)
                    })
            })
    }

    _genEndRoundEmbed (duelWithWinner) {
        let description = this.$t.get('roundIsATie')
        let color       = '#faa61a' 
        let title       = ''
        if (duelWithWinner.winner) {
            const winner    = duelWithWinner.duel.duellists.find(d => d.duellist.id === duelWithWinner.winner)
            color           = winner.color === 'red' ? '#fa1212' : '#1da1f2'
            description     = this.$t.get('roundWonByPlayer', { player: winner.duellist.displayName })
        }

        const fields = []
        duelWithWinner.duel.duellists.forEach(d => {
            const countVictories    = duelWithWinner.duel.count.roundWinners.filter(id => id === d.duellist.id).length
            let niceDots            = countVictories > 0 ? '' : '-'
            for (let i = 0; i < countVictories; i++)
                niceDots += d.color === 'red' ? '🟥 ' : '🟦 '
            fields.push({
                name    : d.duellist.displayName,
                value   : niceDots,
                inline  : true
            })
            if (d.color === 'red')
                title = `🟥 ${d.duellist.displayName.toUpperCase()} ${countVictories} - ` + title
            else 
                title += `${countVictories} ${d.duellist.displayName.toUpperCase()} 🟦`
        })

        return generateEmbed({
                color,
                description,
                fields,
                title, 
                footer      : this.$t.get('resultForRoundNb', { nb: duelWithWinner.duel.count.rounds }),
                thumbnail   : 'https://i.imgur.com/G6Bpy9x.png', 
            })
    }

    _newRoundOrEndGame (message, duelWithWinner) {
        let duelWinner                  = false 
        let countWinningsPerDuellist    = {}
        if (duelWithWinner.duel.count.rounds >= 4) {
            duelWithWinner.duel.count.roundWinners.forEach(w => {
                if (countWinningsPerDuellist[w])
                    countWinningsPerDuellist[w] += 1
                else 
                    countWinningsPerDuellist[w] = 1

                if (countWinningsPerDuellist[w] >= 4)
                    duelWinner = w
            })
        } 
        setTimeout(async () => {
            if (!!duelWinner) {
                duelWithWinner.duel.duellists.forEach(d => {
                    if (d.duellist.id !== duelWinner)
                        d.duellist.stats.defeats += 1
                    else {
                        d.duellist.stats.victories += 1
                        const bonuses           = d.duellist.genDailyGifts()
                        d.duellist.dailyGifts   = [...d.duellist.dailyGifts, ...bonuses]
                    }
                    d.duellist.status   = STATUS.IDLE
                    d.duellist.lastDuel = new Date()
                    this.duellists.update(d.duellist)
                })
                
                duelWithWinner.duel.hasEnded = true 
                this.duels.update(duelWithWinner.duel)
                
                const winner = duelWithWinner.duel.duellists.find(d => d.duellist.id === duelWinner)
                const looser = duelWithWinner.duel.duellists.find(d => d.duellist.id !== duelWinner)
                const fields = []
                duelWithWinner.duel.duellists.forEach(d => {
                    const countVictories    = duelWithWinner.duel.count.roundWinners.filter(id => id === d.duellist.id).length
                    let niceDots            = countVictories > 0 ? '' : '-'
                    for (let i = 0; i < countVictories; i++)
                        niceDots += d.color === 'red' ? '🟥 ' : '🟦 '
                    fields.push({
                        name    : d.duellist.displayName,
                        value   : niceDots,
                        inline  : true
                    })
                })
                const winnerDiscordUser = await message.client.users.fetch(winner.duellist.id)
                const endEmbed = generateEmbed({
                    title       : this.$t.get('duelWonByPlayer', { player: winner.duellist.displayName.toUpperCase(), opponent: looser.duellist.displayName.toUpperCase() }),
                    color       : '#43b581',
                    thumbnail   : winnerDiscordUser.avatarURL({ format: 'jpg', dynamic: true, size: 128 }),
                    description : this.$t.get('duelWonByPlayerDesc', { winner: winner.duellist.displayName, looser: looser.duellist.displayName }),
                    image       : endResultGif[Math.floor(Math.random() * endResultGif.length)], 
                    fields,
                })
                this.duels.endDuel(duelWithWinner.duel)
                message.channel.send(endEmbed)
                    .then(async () => {
                        const mainChannel = await message.client.channels.fetch(this.duelGuild.mainChanId)
                        message.channel.send(this.$t.get('channelToBeDeleted', { mainChannel }))
                            .then(() => {
                                mainChannel.send(endEmbed)
                                setTimeout(() => message.channel.delete(), 10000)
                            })
                    })
            } else 
                this._newRoundTimer(message, duelWithWinner.duel)
        }, 2000)
    }

    _setupNewDuel (offender, defender, message) {
        const discordGuild = message.guild
        discordGuild.channels.create(`🔫${offender.duelUser.displayName.toLowerCase().replace(/\s+/g, '-')}-vs-${defender.duelUser.displayName.toLowerCase().replace(/\s+/g, '-')}`, {
                parent              : this.duelGuild.categoryId, 
                topic               : this.$t.get('letsTheFightBegin'),
                permissionOverwrites: [
                    {
                        id      : discordGuild.id,
                        allow   : ['VIEW_CHANNEL', 'READ_MESSAGE_HISTORY'], 
                        deny    : ['SEND_MESSAGES', 'SEND_TTS_MESSAGES', 'MANAGE_MESSAGES']
                    },
                    {
                        id      : offender.discordUser.id,
                        allow   : ['SEND_MESSAGES', 'READ_MESSAGE_HISTORY'] 
                    },
                    {
                        id      : defender.discordUser.id,
                        allow   : ['SEND_MESSAGES', 'READ_MESSAGE_HISTORY'] 
                    },
                    {
                        id      : message.client.user.id,
                        allow   : ['SEND_MESSAGES', 'MANAGE_MESSAGES', 'EMBED_LINKS', 'ATTACH_FILES', 'READ_MESSAGE_HISTORY'] 
                    },
                ],
                rateLimitPerUser: 5
            })
            .then(channel => {
                message.channel.send(this.$t.get('duelStarting', { offender: offender.duelUser.displayName, defender: defender.duelUser.displayName, channel  }))
                const duel = this.duels.create(channel, offender.duelUser, defender.duelUser)

                const giftEmote     = '🎁'
                const welcomeEmbed  = generateEmbed({
                    title       : this.$t.get('itsTimeForTheDuel'),
                    description : this.$t.get('duelIntro', { offender: offender.discordUser, defender: defender.discordUser, giftEmote }),
                    image       : newDuelImg[Math.floor(Math.random() * newDuelImg.length)],
                    thumbnail   : 'https://i.imgur.com/G6Bpy9x.png', 
                })
                channel.send(`${offender.discordUser}, ${defender.discordUser} !`)
                    .then(() => {
                        channel.send(welcomeEmbed)
                            .then((welcomeMessage) => {
                                const localeCodes   = {
                                    en: 'en-US', 
                                    fr: 'fr-FR'
                                }
                                duel.duellists.forEach(d => {
                                    const thisDiscordUser   = d.duellist.id === offender.discordUser.id ? offender.discordUser : defender.discordUser
                                    let ratio               = '' 
                                    
                                    if (d.duellist.stats.victories + d.duellist.stats.defeats > 0)
                                        ratio = this.$t.get('nbPercentVictories', { nb: Math.round((d.duellist.stats.victories/(d.duellist.stats.victories + d.duellist.stats.defeats))*10000)/100 })
                                    else 
                                        ratio = this.$t.get('noFight')
                                    
                                    let victoriesLabel  = this.$t.get('victories', {}, 2)
                                    let defeatsLabel    = this.$t.get('defeats', {}, 2)
                                    victoriesLabel      = victoriesLabel.charAt(0).toUpperCase() + victoriesLabel.slice(1)
                                    defeatsLabel        = defeatsLabel.charAt(0).toUpperCase() + defeatsLabel.slice(1)
                                    
                                    channel.send(generateEmbed({
                                        title       : `${d.color === 'red' ? `🟥 ${this.$t.get('attacker')}` : `🟦 ${this.$t.get('defender')}` } : ${d.duellist.displayName.toUpperCase()}`, 
                                        color       : d.color === 'red' ? '#fa1212' : '#1da1f2', 
                                        thumbnail   : thisDiscordUser.avatarURL({ format: 'jpg', dynamic: true, size: 128 }),
                                        fields      : [
                                            { name: this.$t.get('registration'), value : new Date(d.duellist.enroledAt).toLocaleDateString(localeCodes[this.duelGuild.locale ||'en']), inline: true },
                                            { name: this.$t.get('lastDuel'), value : d.duellist.lastDuel ? new Date(d.duellist.lastDuel).toLocaleDateString(localeCodes[this.duelGuild.locale ||'en']) : 'N/A', inline: true },
                                            { name: this.$t.get('nbDuels'), value : d.duellist.stats.victories + d.duellist.stats.defeats, inline: false },
                                            { name: victoriesLabel, value : d.duellist.stats.victories, inline: true },
                                            { name: defeatsLabel, value : d.duellist.stats.defeats, inline: true },
                                            { name: this.$t.get('ratio'), value : ratio, inline: true }
                                        ],
                                    }))
                                        .then(msg => {
                                            msg.react(giftEmote)
                                            const filter    = (reaction, user) => reaction.emoji.name === giftEmote && ![message.client.user.id, offender.duelUser.id, defender.duelUser.id].includes(user.id)
                                            const collector = msg.createReactionCollector(filter, { time: 5 * 60000 })
                                            collector.on('collect', async (reaction, reactionCollector) => {
                                                const user      = reaction.users.cache.last()
                                                
                                                let donator     = this.duellists.getById(user.id)
                                                if (!donator) {
                                                    const member    = await discordGuild.members.fetch(user.id)
                                                    donator         = this.duellists.add(member, true)
                                                }
                                                
                                                if (donator && donator.dailyGifts.length > 0) {
                                                    // ticket #3 - score resets
                                                    // needs to fetch the duel in its current state because the gift can occur while the duel already started. 
                                                    const currentStateOfDuel = this.duels.getById(duel.id)
                                                    currentStateOfDuel.bonuses.push({ 
                                                        receiverId  : d.duellist.id,
                                                        donorName   : donator.displayName,   
                                                        bonus       : JSON.parse(JSON.stringify(donator.dailyGifts[0]))
                                                    })
                                                    donator.dailyGifts.splice(0, 1)
                                                    this.duellists.update(donator)
                                                    this.duels.update(currentStateOfDuel)                            
                                                    msg.channel.send(this.$t.get('donatorGiftedEquipmentToPlayer', { donator: donator.displayName, player: d.duellist.displayName }))
                                                    reaction.users.remove(user)
                                                } else if (user) {
                                                    user.send(this.$t.get('errorNoBonusLeft'))
                                                    reaction.users.remove(user)
                                                }
                                            })
                                        })  
                                })
                                setTimeout(() => {
                                    this._newRoundTimer(welcomeMessage, duel)
                                }, 1000)
                            })
                            .catch(process.dLogger.log)
                    })
                    .catch(process.dLogger.log)
            })
    }

    _newRoundTimer (message, duel, remainingSeconds = 5) {
        let embed = generateEmbed({
            title       : this.$t.get('newRoundInSecs', { remainingSeconds }),
            description : this.$t.get('getReady')
        })
        message.channel.send(embed)
            .then(timerMsg => {
                const itvl = setInterval(() => {
                    if (remainingSeconds > 1) {
                        remainingSeconds -= 1
                        embed = generateEmbed({
                            title       : this.$t.get('newRoundInSecs', { remainingSeconds }),
                            description : this.$t.get('getReady')
                        })
                    } else {
                        clearInterval(itvl)
                        duel.busy = false 
                        this.duels.update(duel)
                        
                        embed = generateEmbed({
                            color       : '#43b581', 
                            title       : this.$t.get('newRound'),
                            description : this.$t.get('newRoundInstructions', { prefix: this.duelGuild.prefix })
                        })
                    }
                    timerMsg.edit(embed)
                }, 1000)
            })
    }
}

module.exports = DuelManager
