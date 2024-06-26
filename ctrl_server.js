const discord = true
require('dotenv').config()
const sv_folder = process.env.FOLDER
const { execSync } = require('child_process')

const express = require("express");
const app = express();
const passport = require('passport');
const passportHttp = require('passport-http');

const fetch = require("node-fetch")

const multer  = require('multer')
const maxSize = 40*1000*1000; // 上限40MB
const upload = multer({ dest: process.env.UPLOAD_FOLDER, limits: {fileSize: maxSize } })

const fs = require('fs');


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


const server = app.listen(8080, function () {
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
                        let current_world
                        try {
                            // java版はserver.propertiesのlevel-nameを worlds/{ワールド名} にする
                            const property = execSync(`grep level-name ${sv_folder}/server.properties`)
                            current_world = property.toString().replace("level-name=","").replace("\n","")
                        } catch (error) {
                            console.log(error.message)
                        }
                        postdiscord("Server Started", current_world, 0x00a31b)
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
                        postdiscord("Server Stopped", "", 0xdb0000)
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

app.post("/mcserver-ctrl/upload/", upload.single("world"), passport.authenticate('digest', {session: false}), function (req, res, next) {
    const status = {"upload":false, "worldname":false, "unique":false, "unziptest":false, "unzip":false, "delete":false}
    console.log(req.file)
    // ファイルがあるかチェック
    if (req.file == undefined) {
        res.send(JSON.stringify(status))
        return
    }
    status.upload = true

    // ワールド名検証
    console.log(req.body.file_name)
    // 正規表現で英数字,一部記号のみ抽出
    const matched = req.body.file_name.match(/[0-9A-Za-z-_]/g);
    if (matched == null) {
        console.log("ワールド名空白")
        status.delete = delfile(req.file.path)
        res.send(JSON.stringify(status))
        return
    }

    const world_name = matched.join("")
    console.log(world_name);

    if (world_name == "") {
        console.log("ワールド名空白")
        status.delete = delfile(req.file.path)
        res.send(JSON.stringify(status))
        return
    }
    status.worldname = true

    // 重複チェック
    try {
        const lsout = execSync(`ls ${sv_folder}/worlds/${world_name}`)
        // 重複
        status.delete = delfile(req.file.path)
        res.send(JSON.stringify(status))
        return
    } catch (error) {
        // console.log("重複チェック通過")
    }
    status.unique = true

    // 正常に解凍できるかチェック (unzip -t)
    try {
        const unzipout = execSync(`unzip -q -t ${req.file.path}`)
        if (unzipout.toString().slice(0, -1) == `No errors detected in compressed data of ${req.file.path}.`) {
        } else {
            // 解凍チェックアウト
            status.delete = delfile(req.file.path)
            res.send(JSON.stringify(status))
            return
        }
    } catch (error) {
        console.log("解凍チェックエラー")
        status.delete = delfile(req.file.path)
        res.send(JSON.stringify(status))
        return
    }
    status.unziptest = true

    // 実際に解凍
    try {
        execSync(`unzip -qq -d ${sv_folder}/worlds/${world_name} ${req.file.path}`)
    } catch (error) {
        console.log("本番解凍エラー")
        status.delete = delfile(req.file.path)
        res.send(JSON.stringify(status))
        return
    }
    status.unzip = true

    // 正常終了後ファイル削除
    status.delete = delfile(req.file.path)
    res.send(JSON.stringify(status))
});

function delfile(path) {
    // ファイル削除
    try {
        fs.unlinkSync(path)
        return true
    } catch(error) {
        return false
    }
}

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

function postdiscord(text, world, color) {
    // timestampはUTC時刻だけど、Discord側で調整してくれる
    const date = new Date()
    const post_body = {
        "title": `__${text}__`,
        "url": process.env.SITE_URL,
        "color": color,
        "timestamp": date.toISOString()
    }
    if (world != "" && world != null) {
        post_body["fields"] = [{"name": "world", "value": `\`${world}\``}]
    }
    console.log(post_body)
    const options = {
        method: 'POST',
        body:    JSON.stringify({"username":"Controll Panel", "embeds": [post_body]}),
        headers: { 'Content-Type': 'application/json' },
    }
    fetch(process.env.URL, options)
}