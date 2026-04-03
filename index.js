const TEST_MODE = true


const express = require('express')
const fs = require('fs')
const path = require('path')
const dubnium = require('dubnium')
const cors = require("cors")
const users = new dubnium('./users')
const config = TEST_MODE ? require('./test_config.json') : require("./config.json")
const bodyParser = require("body-parser")
const id = () => { return new Date(0).getTime() }
const key = () => { return require("crypto").randomBytes(20).toString("hex") }
const bcrypt = require("bcrypt")

//require("./bot")
const PORT = config.port
const template = new dubnium.Template({
    "name": "",
    "pass": "",
    "displayName": "",
    "key": "",
    "tier": "",
    "contact": "",
    "domain": "",
    "home": "",
    "about": "",
    "incidents": {},
    "js":"",
    "css":"",
    "created":"",
    "hook":''
})


// check if string has one object in array
const hasOne = (str="", arr=[]) => {
let has = false
arr.forEach(a => {
if(str.split(/(^\w+:|^)\/\//).join("").includes(a)) has = true
})
return has
}

const stripe = new (require('stripe')).Stripe(config.stripe_api_key)

const subName = async (subId) => {
try{
const sub = await stripe.subscriptions.retrieve(subId)
const price = await stripe.prices.retrieve(sub.items.data[0].price.id)
const prod = await stripe.products.retrieve(price.product)
return prod.name.replace("Incidents.me", "").toUpperCase().trim()
}catch(e){
return "FREE"
}
}

module.exports.subname = subName

const removeSlash = (str="", join=true) => {
  return (join == true ? str.split("/").join("") : str.split("/"))
}

const removeOldIncidents = async ( username ) => {
  if(username == 'demo') return
  const user = users.get(username).content
  const incidents = user.incidents
  const keys = Object.keys(incidents)
  const now = new Date(0).getTime()
  const seven = 604800000
  const thirty = 2592000000
  const fourteen = 1209600000
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i]
    const incident = incidents[key]
    const time = (await subName(user.tier)) == 'pro' ? fourteen : (await subName(user.tier)) == 'premium' ? thirty : seven
    if (now - incident.time > time) {
      delete incidents[key]
    }
  }
  users.get(username).overwrite(user)
}

users.on('overwrite', (tag, old, n) => {
try{
if(n.hook && old.incidents != n.incidents && Object.keys(n.incidents).length > Object.keys(old.incidents).length){
const incident = Object.keys(n.incidents)[Object.keys(n.incidents).length - 1]
const i = n.incidents[incident]
new (require("discord.js")).WebhookClient({ url:n.hook }).send({ content:`<t:${Math.floor(new Date(incident).getTime()/1000)}:f> - ${i.about}`, username:`New Incident`, avatarURL:`https://media.discordapp.net/attachments/909964175965581332/1046572498726170634/logo.png` })
}
}catch{}})

const four0four = (req, res, reason) => {
if(!res.headersSent){
  let new404 = fs.readFileSync(`${__dirname}/404.html`, 'utf8').split("%reason%").join(reason)
  return req.accepts("application/json") ? res.status(404).send({ error:reason }) : res.status(404).send(new404)
}
  }


const getPage = async (username, req, res, next) => {
  try{
  if(!users.get(username)) {return next()}else{
  if(removeSlash(req.path, false)[1] == 'incident'){
    const id = removeSlash(req.path, false)[2]
    const usr = users.get(username)
    if(!usr) return four0four(req,res,"User not found")
    if(!usr.content.incidents) return res.status(404).send({ error:"No incidents" })
    if(!usr.content.incidents[id]) return res.status(404).send({ error:`No incident found. Trying to find ${id}` })
    const c = fs.readFileSync(`${__dirname}/ipage.html`, 'utf8')
    const i = usr.content.incidents[id]
    let s = ''
    for(const key in config.types){
      if(config.types[key] == i.type) s = key.split("_").join(" ")
    }
    const e = c.split("%Name%").join(i.name).split("%Content%").join(i.about).split('%Date%').join(id).split("%Type%").join(s).split("%Date%").join(i.date).split("%Date%").join(new Date(id).toDateString()).split("%Status%").join(i.status ? `Status: ${i.status}` : "")
    return res.status(200).send(e)
  }else if(removeSlash(req.path) == 'rss'){
    const usr = users.get(username)
    if(!usr) return four0four(req,res,"User not found")
    if(!usr.content.incidents) return res.status(404).send({ error:"No incidents" })
    const incidents = usr.content.incidents
    let i = ''
    for(const key in incidents){
      i += `<item>
      <title>${incidents[key].name}</title>
      <link>${usr.content.domain || `${username}.${config.url.replace(/(^\w+:|^)\/\//,'')}`}/incident/${key}</link>
      <description>${incidents[key].about}</description>
      <pubDate>${new Date(key).toDateString()}</pubDate>
      <guid>${key}</guid>
      <category>${Object.keys(config.types)[incidents[key].type-1]}</category>
      </item>`
    }
    res.set('Content-Type', 'application/rss+xml');
    return res.status(200).send(i)
  }else if(removeSlash(req.path) == 'json'){
  const c = users.get(username).content
  delete c.key
  delete c.pass
  c.tier = (await subName(c.tier))
  delete c.tier
  return res.status(200).send(c)
  }
  else{
  const user = users.get(username).content
  const src = fs.readFileSync(`${__dirname}/page.html`, 'utf8')
  let newsrc = src.split("%User%").join(user.name).split('%url%').join(config.url).split('%uname%').join(username)
  const sname = (await subName(user.tier)).toLowerCase()
  if((user.js && (sname == 'premium' || sname == 'enterprise'))) newsrc = newsrc.split('<!--CUSTOM_JS-->').join(`<script src="${user.js}"</script>`) 
  if((user.css && (sname == 'pro' || sname == 'premium' || sname == 'enterprise'))) newsrc = newsrc.split('<!--CUSTOM_CSS-->').join(`<link rel="stylesheet" href="${user.css}">`) 
  res.send(newsrc)
  }
  }
  }catch(e){
  res.status(400).send({error:new Error(e).message})
  }
}

const replace = (src,replacing,replaceWith) => {
  return src = src.split(replacing).join(replaceWith)
}

const walkDir =(dir, callback) => {
  fs.readdirSync(dir).forEach( f => {
    let dirPath = path.join(dir, f)
    let isDirectory = fs.statSync(dirPath).isDirectory()
    isDirectory ? 
      this.walkDir(dirPath, callback) : callback(path.join(dir, f))
  })
}

module.exports.walkDir = walkDir

const app = express()
module.exports = app
app.use(bodyParser.json())
app.use(bodyParser.urlencoded({ extended: true }))

app.use(async (req, res, next) => {
  const u = users.getFromValue("domain", req.headers.host, 2)[0] || users.get(req.headers.host.split(".")[0]) || users.get(req.params.user) || undefined
  if(typeof u == 'undefined' || !u.tag) return req.subdomains.length ? four0four(req,res,'User not found') : next() 
  if((await subName(u.content.tier)) == 'FREE' && !hasOne(req.hostname,require("./config.json").freeDomains)) return four0four(req,res,'User must be a pro, premium, or enterprise user to use custom domains.')
  await getPage(u.tag,req, res, next)
  })

app.use(express.static('./static'))

app.get("/types", cors(), (req,res) => { res.send(config.types) })

app.get("/checkout-session/:id", async (req, res) => {
  const sessionId = req.params.id;
  const session = await stripe.checkout.sessions.retrieve(sessionId);
  res.send(session);
});

app.post("/create-checkout-session", bodyParser.json() , async (req, res) => {
  const tier = req.body.tier;
  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [
        {
          price:config.tiers[tier].id,
          quantity: 1,
        }, 
      ],
      success_url: `http://${req.hostname}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `http://${req.hostname}/canceled.html`,
 //      automatic_tax: { enabled: true }
    });

    return res.redirect(303, session.url);
  } catch (e) {
    res.status(400);
    return res.send({
        error: e.message,
    });
  }
});



app.post("/handle/:id", async (req, res) => {
  const {id} = req.params
  const {user} = req.headers
  const session = await stripe.checkout.sessions.retrieve(id)
  const other = users.getFromValue("tier", session.subscription, 2)[0]
  if(other && other.tag != user) return res.status(400).send({error:"That's someone else's subscription"})
  if(session.payment_status == 'paid'){
  try{
  const newcontent = users.get(user).content
  newcontent.tier = session.subscription
  users.get(user).overwrite(newcontent)
  const customer = await stripe.customers.retrieve(session.customer)
  res.send({ message:`Thanks for your purchase, ${customer.name}! Your subscription will renew every month until canceled.` });  }catch (err) {
    res.status(400).send({error:new Error(err).message});
  }
  }else{
  res.status(400).send({error: 'Payment not paid'})
  }
});


app.post("/login", (req, res) => {
if(!users.get(req.body.user) || !bcrypt.compareSync(req.body.pass, users.get(req.body.user).content.pass)) return res.send('<script>location="/?failed"</script>')
const u = users.get(req.body.user).content
res.send(`<script>
localStorage.setItem("user", "${u.key}")
localStorage.setItem("name", "${u.name}")
localStorage.setItem("uname", "${req.body.user}")
location="/dash"
</script>`)
})

app.get("/signin/discord/step/2", (req, res) => {
  const u = users.getFromValue("discord", req.query.id, 2)[0]
  if(!u) return res.send('<script>location="/?failed"</script>')
  res.send(`<script>
  localStorage.setItem("user", "${u.content.key}")
  localStorage.setItem("name", "${u.content.name}")
  localStorage.setItem("uname", "${u.tag}")
  location="/dash"
  </script>`)
  })


app.post('/new/incident', (req, res) => {
  try{
    if(!users.get(req.body.uname) || users.get(req.body.uname).content.key != req.body.key) return res.send('<script>location="/dash?incident_401"</script>')
    const u = users.get(req.body.uname)
    let newcontent = u.content
    if(!newcontent.incidents) newcontent.incidents = {}
    const incident = { name:req.body.name.substring(0,config.maxCharsTitle), status: req.body.type == '2' ? "" : req.body.status || "Evaluating", created:new Date().toISOString(), about:req.body.desc.substring(0,config.maxCharsIncident), type:req.body.type || 1, ongoing:true }
    let date = new Date()
    if(!isNaN(Date.parse(req.body.date))){
      date = new Date(`${req.body.date}T${req.body.time ? req.body.time : '00:00'}`)
    }
    newcontent.incidents[date.toISOString()] = incident
    u.overwrite(newcontent)
    return res.send('<script>location="/dash"</script>')
    }catch (err){
      return res.send(`<script>location="/dash?incident_500=${err.message}"</script>`)
    }})


  app.post(`/edit/incident`, (req, res) => {
    try{
      if(!users.get(req.body.uname) || users.get(req.body.uname).content.key != req.body.key) return res.send('<script>location="/dash?incident_401"</script>')
      const u = users.get(req.body.uname)
      let newcontent = u.content
      if(!newcontent.incidents) newcontent.incidents = {}
      const incident = { name:req.body.name.substring(0,config.maxCharsTitle), status: req.body.type == '2' ? "" : req.body.status || "Evaluating", about:req.body.desc.substring(0,config.maxCharsIncident), type:req.body.type || 1, ongoing:req.body.ongoing == "on" ? true : false }
      newcontent.incidents[req.body.date] = incident
      u.overwrite(newcontent)
      res.send('<script>location="/dash"</script>')
      }catch (err){
        res.send(`<script>location="/dash?incident_500=${err.message}"</script>`)
      }    })
    

app.patch(`/api/edit/incident`, cors(), (req, res) => {
  try{
    const u = users.getFromValue("key", req.headers.key, 2)[0]
    if(!u) return res.status(401).send({error:"Invalid key"})
    if(!u.content.key != req.body.key) return res.status(401).send({error:"Invalid key"})
    let newcontent = u.content
    if(!newcontent.incidents) newcontent.incidents = {}
    const data = u.content[req.body.date]
    const name = req.body.name ? req.body.name.substring(0,config.maxCharsTitle) : data.name
    const status = req.body.status ? req.body.status : data.status
    const about = req.body.desc ? req.body.desc.substring(0,config.maxCharsIncident) : data.about
    const type = req.body.type ? req.body.type : data.type
    const ongoing = req.body.ongoing ? req.body.ongoing == "on" ? true : false : data.ongoing
    const incident = { name, status, about, type, ongoing }
    newcontent.incidents[req.body.date] = incident
    u.overwrite(newcontent)
    res.status(200).send(incident)
    }catch (err){
      res.send({error:err.message})
    }  })

app.post('/api/incident', cors(), (req, res) => {
  try{
  const u = users.getFromValue('key',req.headers.key,2)[0]
  if(!u) return res.status(401).send({error:'Unauthorized'})
  let newcontent = u.content
  if(!newcontent.incidents) newcontent.incidents = {}
  const incident = { name:req.body.name.substring(0,config.maxCharsTitle), created:new Date().toISOString(), about:req.body.desc.substring(0,config.maxCharsIncident), type:req.body.type || 1, ongoing:true }
  const date = new Date().toISOString()
  newcontent.incidents[date] = incident
  u.overwrite(newcontent)
  return res.send({ message:'Incident created', incident, date })
  }catch (err){
res.send({ error:err.message })
  }
})

app.get('/users/:uname', (req,res) => {
res.send(`<script>location="${req.params.uname}.${req.headers.host}"</script>`)
})

app.get("/:uname/incidents/json", cors({ optionsSuccessStatus:200}), (req, res) => {
if(!users.get(req.params.uname)) return res.send({error:'User not found'})
const u = users.get(req.params.uname).content
if(!u.incidents) return res.status(404).send({ error:"No incidents" }) 
res.send(u.incidents)
})


app.post("/resolve/:user/:id", (req,res) => {
  const usr = users.get(req.params.user)
  const u = users.get(req.params.user).content
  const _id = decodeURIComponent(req.params.id)
  if(!u.incidents) return res.status(404).send({ error:"No incidents" }) 
  if(!u.incidents[_id]) return res.status(404).send({ error:`No incident found. Trying to find ${_id}` }) 
  const newcontent = u
  newcontent.incidents[_id].ongoing = false
  usr.overwrite(newcontent)
  res.status(200)
})


app.post("/api/resolve/:id", cors(), (req,res) => {
  const usr = users.getFromValue("key", req.body.key, 2)[0]
  if(!usr) return res.status(401).send({ error:"Unauthorized" })
  const u = users.get(req.params.user).content
  const _id = decodeURIComponent(req.params.id)
  if(!u.incidents) return res.status(404).send({ error:"No incidents" }) 
  if(!u.incidents[_id]) return res.status(404).send({ error:`No incident found. Trying to find ${_id}` }) 
  const newcontent = u
  newcontent.incidents[_id].ongoing = false
  usr.overwrite(newcontent)
  res.status(200).send({ message:"Incident resolved" })
})

app.delete("/:user/:id", async (req,res) => {
  const usr = users.get(req.params.user)
  const u = usr.content
  const _id = decodeURIComponent(req.params.id)
  if(!u.incidents) return res.status(404).send({ error:"No incidents" }) 
  if(!u.incidents[_id]) return res.status(404).send({ error:`No incident found. Trying to find ${_id}` }) 
  const newcontent = u
  delete newcontent.incidents[_id]
  usr.overwrite(newcontent)
  res.status(200).send({ message:"Incident deleted" })
})
app.delete("/api/incident/:id", cors(), async (req,res) => {
  const usr = users.getFromValue("key", req.body.key, 2)[0]
  const u = usr.content
  if(!usr) return res.status(401).send({ error:"Unauthorized" })
  const _id = decodeURIComponent(req.params.id)
  if(!u.incidents) return res.status(404).send({ error:"No incidents" }) 
  if(!u.incidents[_id]) return res.status(404).send({ error:`No incident found. Trying to find ${_id}` }) 
  const newcontent = u
  delete newcontent.incidents[_id]
  usr.overwrite(newcontent)
  res.status(200).send({ message:"Incident deleted" })
})

app.post("/signup", (req,res) => {
if(!req.body.name || !req.body.pass) return res.status(400).send("You must fill out both user & password")
if(req.body.name.length > 10 || req.body.name.length < 3) return res.status(400).send("User must be between 3 & 10 characters")
if(req.body.pass.length < 8) return res.status(400).send("Password must be at least 8 characters")
if(users.has(req.body.name)) return res.status(409).send("User already exists")
const newuser = users.create(req.body.name, {
  email:req.body.email,
  password:bcrypt.hashSync(req.body.pass, 10),
  displayName:req.body.name,
  incidents:{},
  key:key(),
  tier:"free",
  created:new Date().toISOString()
}, {})
res.status(201).send(`<script>
localStorage.setItem("user", "${newuser.content.key}")
localStorage.setItem("name", "${newuser.content.name}")
localStorage.setItem("uname", "${newuser.tag}")
location="/dash"
</script>`)
})



app.patch("/account/:user/:type", async (req,res) => {
  const usr = users.get(req.params.user)
  const u = users.get(req.params.user).content
  const type = req.params.type
  removeOldIncidents(req.params.user)
  const sname = (await subName(u.tier)).toLowerCase()
  if((type == 'js' && !(sname == 'premium' || sname == 'enterprise')) && req.headers.value.length) {return res.status(401).send("You must be a premium or enterprise user to use custom JS")}
  if((type == 'css' && !(sname == 'pro' || sname == 'premium' || sname == 'enterprise'))  && req.headers.value.length) {return res.status(401).send("You must be a pro, premium, or enterprise user to use custom CSS")}
  if((type == 'domain' && !(sname == 'pro' || sname == 'premium' || sname == 'enterprise'))  && req.headers.value.length) {return res.status(401).send("You must be a pro, premium, or enterprise user to set a custom domain")}
  if(!Object.keys(u).includes(type)) return res.status(404).send({ error:"Type not found" }) 
  const newcontent = u
  if(type != 'home' || type != 'name') newcontent[type] = req.headers.value.length > config.maxChars ? `${req.headers.value.substring(0,config.maxChars)}...` : req.headers.value
  res.status(200).send(req.headers.value.length ?  `Changed ${type}` : `Removed ${type}`)
  usr.overwrite(newcontent)
})

app.post("/new/key", (req,res) => {
const { user } = req.headers
if(users.get(user).content.key == req.headers.key){
if(users.get(user).content.pass != req.headers.pass) return res.status(401).send({error:"Incorrect password"})
const newc = users.get(user).content
newc.key = key()
users.get(user).overwrite(newc)
res.status(200).send({ key:newc.key })
}else{
res.status(401).send({error:"Provided key is invalid"})
}
})

app.delete('/subscription', async (req, res) => {
  try{
  const { user } = req.headers
  if(users.get(user).content.pass == req.headers.pass){
  if(users.get(user).content.pass != req.headers.pass) return res.status(401).send({error:"Incorrect password"})
  try{ await stripe.subscriptions.cancel(users.get(head.user).content.tier) }catch { return res.status(400).send({error:"You don't have a subscription"}) }
  const newc = users.get(user).content
  newc.tier = "free"
  users.get(user).overwrite(newc)
  res.status(200).send({ message:"We've canceled your subscription." })
  }else{
  res.status(401).send({error:"Password is incorrect"})
  }
}catch(err) {
  res.status(500).send({error:err.message})
}
})

app.delete("/account", async (req,res) => {
const head = req.headers
const usr = users.get(head.user)
const c = usr.content
if(!usr) return res.status(401).send({error:"User not found"})
if(c.pass != head.pass) return res.status(401).send({error:"Incorrect password"})
if(c.key != head.key) return res.status(401).send({error:"Incorrect key"})
try{ await stripe.subscriptions.cancel(users.get(head.user).content.tier) }catch {  }
usr.delete()
res.status(200).send({ error:"Deleted account" })
})

app.get('/account/:user/:type?', cors(), async (req, res) => {
if(!users.get(req.params.user)) return res.status(404).send({ error:"User not found" })
removeOldIncidents(req.params.user)
const usr = users.get(req.params.user).content
delete usr.pass
usr.tier = (await subName(usr.tier))
delete usr.tier
delete usr.key
usr.incidents = `http://${req.hostname}/${req.params.user}/incidents/json`
res.send( req.params.type ? usr[req.params.type] : usr )
})

app.get("/bot/added", async (req,res) => {
  const html = fs.readFileSync("./addedbot.html")
  try{
  const guild = (await require('./bot').guilds.fetch(req.query.guild_id))
  const newhtml = html.toString().split("%Guild%").join(`to <img style="border-radius: 100px; width:2%;" src="${guild.iconURL({dynamic:true})}"> ${guild.name}`).split(`%GuildName%`).join(guild.name)
  res.send(newhtml)
  }catch(err) {
  const newhtml = html.toString().split("%Guild%").join("").split("%GuildIcon%").join("")
  res.send(newhtml)
  }
  })

  const { request } = require('undici')
const { ActionRowBuilder, ButtonBuilder } = require('@discordjs/builders')
const { ButtonStyle, PermissionFlagsBits } = require('discord.js')
const { randomUUID } = require('crypto')

  app.get('/discord/connect/step/1', (req,res) => {
  res.redirect('/discord/connect')
  })

  app.get('/discord/connect/step/2', async ({ query }, response) => {
    const { code } = query;
    const { discordClientId, discordClientSecret } = require("./config.json")
  
    if (code) {
      try {
        const tokenResponseData = await request('https://discord.com/api/oauth2/token', {
          method: 'POST',
          body: new URLSearchParams({
            client_id: discordClientId,
            client_secret: discordClientSecret,
            code,
            grant_type: 'authorization_code',
            redirect_uri: TEST_MODE ? `http://localhost/discord/connect/step/2` : `${config.url}/discord/connect/step/2`,
            scope: 'identify',
          }).toString(),
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        });
  
        const oauthData = await tokenResponseData.body.json();

        const userResult = await request('https://discord.com/api/users/@me', {
	headers: {
		authorization: `${oauthData.token_type} ${oauthData.access_token}`,
	},
});

response.redirect(`/discord/connect/step/3?id=${(await userResult.body.json()).id}`);
      } catch (error) {
        console.error(error);
      return response.send({error:error.message});
      }
    }
  });

  

  app.get('/discord/connect/step/3', async (req,res) => {
  res.send("<script>if(localStorage.getItem('uname')) {fetch(`/discord/connect/step3?user=${localStorage.getItem('uname')}&id=${new URLSearchParams(location.search).get('id')}`, { method:'POST' }).then(e => {if(e.status == 200){location = `/discord/connect/finished?id=${new URLSearchParams(location.search).get('id')}`}else{location = `/discord/connect/error?err=${e.status}`}})}else{location = `/signin/discord/step/2?id=${new URLSearchParams(location.search).get('id')}`}</script>")
  })

  app.post('/discord/connect/step3', async (req,res) => {
    const { user, id } = req.query
    users.get(user).overwrite({ ...users.get(user).content, discord: id })
    res.status(200).send({ message:"Connected" })
    })


  app.get('/discord/connect/finished', async (req,res) => {
  try{
    const u =  await require('./bot').users.fetch(req.query.id)
    const src = fs.readFileSync("./step3.html",'utf8').split("%User%").join(u.tag).split("%Avatar%").join(u.displayAvatarURL({dynamic:true}))
    res.send(src)
      }catch(err) {
        res.status(400).send({error:err.message})
      }
  })

  app.get('/discord/user/:id', cors(), async (req,res) => {
    try{
  res.send(await require('./bot').users.fetch(req.params.id))
    }catch(err) {
      res.status(400).send({error:err.message})
    }
  })


/*
process.on('exit', () => {
	console.clear()
			require("child_process").spawn(process.argv.shift(), process.argv, {
					cwd: process.cwd(),
					detached : true,
					stdio: "inherit"
				});
			
})
*/



app.listen(PORT, () => console.log(`Server online @ port ${PORT} (${new Date().getHours()}:${new Date().getMinutes()})`))