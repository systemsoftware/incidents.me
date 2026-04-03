const TEST_MODE = false

const { REST, Routes, SlashCommandBuilder, Client, EmbedBuilder, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const dubnium = require('dubnium');

const { discordClientId, guildId, discord_token, types, stripe_api_key} = require('./config.json');
const users = new dubnium('./users', 'json')
let t = []

const stripe = new (require('stripe')).Stripe(stripe_api_key)

const subname = async (subId) => {
try{
const sub = await stripe.subscriptions.retrieve(subId)
const price = await stripe.prices.retrieve(sub.items.data[0].price.id)
const prod = await stripe.products.retrieve(price.product)
return prod.name.replace("Incidents.me", "").toUpperCase().trim()
}catch(e){
return "FREE"
}
}

for(const type of Object.keys(types)) {
    t.push({ name:type.split("_").join(" "), value:`${types[type]}` })
}

const body = [
new SlashCommandBuilder().setName('user').setDescription('Get user').addStringOption(o => o.setName("user").setDescription("Username to get").setRequired(true)),
new SlashCommandBuilder().setName('incidents').setDescription('Get the last 5 incidents for a user.').addStringOption(o => o.setName("user").setDescription("Username to get").setRequired(true)).addStringOption(o => o.setName("type").setDescription("Incident type").setRequired(true).addChoices(...t)),
new SlashCommandBuilder().setName('page').setDescription('Get link to page').addStringOption(o => o.setName("user").setDescription("Username to get").setRequired(true)),
new SlashCommandBuilder().setName('dash').setDescription('Get link to dashboard'),
new SlashCommandBuilder().setName('incident').setDescription('Create a new incident')
.addStringOption(o => o.setName("type").setDescription("Incident type").setRequired(true).addChoices(...t))
.addStringOption(o => o.setName("name").setDescription("Incident name").setRequired(true))
.addStringOption(o => o.setName("status").setDescription("Incident status").setRequired(true))
.addStringOption(o => o.setName("incident").setDescription("Incident body").setRequired(true))
,
]

const rest = new REST({ version: "10" }).setToken(discord_token)

const url = (u) => `${u.content.domain ? `${u.content.domain.startsWith('http') ? "" : "http://" }${u.content.domain} &` : ""}  https://${u.tag}.incidents.me`

    const client = new Client({ intents: [GatewayIntentBits.Guilds] })
    client.on("interactionCreate", async interaction => {
        await interaction.deferReply({ ephemeral:true })
        try{
        if(interaction.isCommand()) {
          if(interaction.commandName === "user") {
            const user = interaction.options.getString("user")
            if(users.get(user) == null) return await interaction.followUp({ content: "User not found."})
            const u = users.get(user).content
            const em = new EmbedBuilder().setTitle(user).setDescription(u.about ? u.about : "No bio").setColor("Random")
            const s = await subname(u.tier)
            em.addFields({ name:"Tier", value:s, inline:true }, { name:"Incidents", value:`${Object.keys(u.incidents).length}`, inline:true })
            await interaction.followUp({ embeds:[em] })
          }else if(interaction.commandName === "incidents") {
            const user = interaction.options.getString("user")
            if(users.get(user) == null) return await interaction.followUp({ content: "User not found."})
            const type = interaction.options.getString("type")
            const u = users.get(user).content
            let str = ''
            let index = 0
            Object.keys(u.incidents).forEach(i => {
                if(index > 4) return
                if(u.incidents[i].type === type) {
                    str += `<t:${Math.floor(new Date(i).getTime()/1000)}:f> - ${u.incidents[i].about}\n`
                }
                index++
            })
            if(str === '') return await interaction.followUp({ content: "No incidents found." })
            await interaction.followUp({ content: str})
        }else if(interaction.commandName === "page") {
            const user = interaction.options.getString("user")
            if(users.get(user) == null) return await interaction.followUp({ content: "User not found."})
            const u = users.get(user).content
            await interaction.followUp({ content:url(users.get(user)) })
        }else if(interaction.commandName === "dash") {
            await interaction.followUp({ content: `https://incidents.me/dash`, ephemeral:true })
        }else if(interaction.commandName == 'incident'){
            const type = interaction.options.getString("type")
            const name = interaction.options.getString("name")
            const status = interaction.options.getString("status")
            const about = interaction.options.getString("incident")
            const u = users.getFromValue('discord', interaction.user, 2)[0]
            if(!u) return interaction.followUp({ content: "You are not linked to an account." })
            let newcontent = u.content
            if(!newcontent.incidents) newcontent.incidents = {}
            const newI = { name, status: type == '2' ? "" : status, created:new Date().toISOString(), about, type, ongoing:true }
            newcontent.incidents[new Date().toISOString()] = newI
            u.overwrite(newcontent)
            interaction.followUp({ content: `Incident created. You can view it on [your page](${url(u)})` })
        }
        }
    }catch(e) {
     await interaction.followUp({ content: `An error occured. \n\n Error: ${e.message}`, ephemeral: true }) 
    }
    })
   // client.login(discord_token)
    module.exports = client

    if(TEST_MODE == false){
    rest.put(Routes.applicationGuildCommands(discordClientId, "1009558443654393897"), { body:{} })
	.then(() => console.log('Successfully removed beta commands.'))
	.catch(console.error) 
rest.put(Routes.applicationCommands(discordClientId), { body })
.then(() => console.log('Successfully registered application commands.'))
.catch(console.error)
    }else{
        rest.put(Routes.applicationGuildCommands(discordClientId, "1009558443654393897"), { body })
        .then(() => console.log('Successfully reloaded beta commands.'))
        .catch(console.error)  
    }