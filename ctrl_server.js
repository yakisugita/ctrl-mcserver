const discord = false
require('dotenv').config()
const sv_folder = process.env.FOLDER
const { execSync, exec } = require('child_process')

const express = require("express");
const passport = require('passport');
const passportHttp = require('passport-http');

const fetch = require("node-fetch")

const app = express();


const record = { username: process.env.ID, password: process.env.PASS }
passport.use(new passportHttp.DigestStrategy({ qop: 'auth'} ,
 (username,cb) => {
    if (username === record.username) {
      return cb(null, username, record.password);
    } else {
      return cb(null,false)
    }
  }
));


const server = app.listen(8881, function () {
    console.log("Node.js is listening to PORT:" + server.address().port);
});


app.get("/mcserver-ctrl/", function (req, res, next) {
    res.sendFile(__dirname + '/ctrl_page.html');
});

app.get("/mcserver-ctrl/api/:command/", passport.authenticate('digest', {session: false}), function (req, res, next) {
    switch (req.params.command) {
        case "status":
            try {
                const stdout1 = execSync("screen -ls | grep bds_sandbox")
                const res_obj = { "status": stdout1.toString() }
                res.send(JSON.stringify(res_obj))
            } catch (error) {
                console.log(error.message);
                console.log("screen -ls:error", error.stdout.toString())
                res.send(JSON.stringify({"status": "stopped"}))
            }
            break;

        case "start":
            try {
                if(isworking()) {
                    res.send('{"status":"working"}')
                } else {
                    execSync(`cd ${sv_folder}\nscreen -dmS bds_sandbox ./bedrock_server`)
                    if (discord) {
                        postdiscord("鯖起動:white_check_mark: ")
                    }
                    res.send('{"status":"start"}')
                }
            } catch (error) {
                console.log(error.message)
                res.send('{"status":"error"}')
            }
            break;
        
        case "stop":
            try {
                if(isworking()) {
                    let stdout = execSync("screen -r bds_sandbox -X stuff 'stop\n'")
                    // stuff $'stop\n'だとうまくいかなかった
                    if (discord) {
                        postdiscord("鯖停止:white_check_mark: ")
                    }
                    res.send('{"status":"stop"}')
                } else {
                    res.send('{"status":"stopped"}')
                }
            } catch (error) {
                console.log(error.message)
                res.send('{"status":"error"}')
            }
            break;

        case "worlds":
            try {
                // java版はserver.propertiesのlevel-nameを worlds/{ワールド名} にする
                const stdout1 = execSync(`ls ${sv_folder}/worlds`)
                const stdout2 = execSync(`grep level-name ${sv_folder}/server.properties`)
                const res_obj = {"status":"success", "worlds": stdout1.toString().split("\n"), "world": stdout2.toString().replace("level-name=","").replace("\n","") }
                res.send(JSON.stringify(res_obj))
            } catch (error) {
                console.log(error.message)
                res.send('{"status":"error"}')
            }
            break;

        case "change":
            try {
                if(isworking()) {
                    res.send('{"status":"working"}')
                } else {
                    const worldindex = req.query.worldindex
                    const stdout1 = execSync(`ls ${sv_folder}/worlds`)
                    const changed = stdout1.toString().split("\n")[worldindex]
                    if (changed && changed != "") {
                        // 現在のlevel-nameを取得
                        const stdout2 = execSync(`grep level-name ${sv_folder}/server.properties`)
                        // 置換
                        execSync(`sed -i s/${stdout2.toString().replace("\n","")}/level-name=${changed}/ ${sv_folder}/server.properties`)
                        // 変更後のlevel-nameを取得
                        const stdout4 = execSync(`grep level-name ${sv_folder}/server.properties`)
                        const res_obj = {"status":"changed", "world":stdout4.toString().replace("level-name=","").replace("\n", "")}
                        res.send(JSON.stringify(res_obj))
                    } else {
                        res.send('{"status":"notfound"}')
                    }
                }
            } catch (error) {
                console.log(error.message)
                res.send('{"status":"error"}')
            }
            break;
        
        case "logs":
            try {
                if(isworking()) {
                    if (req.query.scope == "all") {
                        execSync(`screen -r bds_sandbox -X hardcopy -h ${sv_folder}/bds_sandbox.log`)
                    } else {
                        execSync(`screen -r bds_sandbox -X hardcopy ${sv_folder}/bds_sandbox.log`)
                    }
                    const stdout = execSync(`cat ${sv_folder}/bds_sandbox.log`)
                    const res_obj = {"status":"success", "logs":stdout.toString()}
                    res.send(JSON.stringify(res_obj))
                } else {
                    res.send('{"status":"stopped"}')
                }
            } catch (error) {
                console.log(error.message)
                res.send('{"status":"error"}')
            }
            break;

        default:
            res.send("Unexpected Parameter")
    }
});

function isworking() {
    try {
        execSync("screen -ls | grep bds_sandbox")
        return true;
    } catch (error) {
        console.log(error.message);
        console.log("screen -ls:error", error.stdout.toString())
        return false;
    }
}

function postdiscord(text) {
    const options = {
        method: 'POST',
        body:    JSON.stringify({"username":"マイクラサーバーコンパネ", "content":text}),
        headers: { 'Content-Type': 'application/json' },
    }
    fetch(process.env.URL, options)
}