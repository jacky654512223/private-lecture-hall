# 部署教程

## 准备

准备 Linux 服务器，起步建议 2 核 2 GB、20 GB 以上磁盘，一个域名和公网 IPv4。将域名 A 记录指向 IP，放行 TCP 80/443，按 SSH 管理需求配置 22。大陆节点按接入商要求完成备案，香港到大陆访问效果需实测。

项目使用 Node.js 24、SQLite 和文件系统。一个实例运行，数据库及上传目录必须持久化。

## Docker Compose

安装 Docker Engine 和 Compose，将整个仓库放到服务器。

    cp .env.example .env

编辑 .env，填写 HALL_DOMAIN 为你的域名，不带 https:// 或路径。

    docker compose up -d --build
    docker compose logs --tail=100

DNS 和端口就绪后，Caddy 自动签发 HTTPS。打开 https://你的域名。

hall-data 卷存数据库和上传，caddy-data 存证书。升级前备份，不要用 down -v 删除卷。

    git pull --ff-only
    docker compose up -d --build

镜像拉取失败时可用下方 systemd 路线。

## Node.js + systemd

以 Ubuntu 24.04 为例，安装 Node.js 24、Caddy 和 Git。检查 node --version，确保服务模板 ExecStart 指向实际 Node 路径，默认 /usr/bin/node。

代码放到 /srv/lecture-hall，父目录和代码需对服务用户可读。

    cd /srv/lecture-hall
    npm run build
    npm test
    sudo useradd --system --home /var/lib/lecture-hall --shell /usr/sbin/nologin lecturehall
    sudo cp deploy/native.env.example /etc/lecture-hall.env

编辑环境文件。

    PUBLIC_ORIGIN=https://classroom.example.com
    HOST=127.0.0.1
    PORT=8787
    DATA_DIR=/var/lib/lecture-hall
    MAX_UPLOAD_GB=1

PUBLIC_ORIGIN 要与最终浏览器地址一致。systemd 自动创建可写的数据目录。

    sudo cp deploy/lecture-hall.service /etc/systemd/system/
    sudo systemctl daemon-reload
    sudo systemctl enable --now lecture-hall

将 deploy/native.Caddyfile 的示例域名替换为实际域名，安装到 /etc/caddy/Caddyfile。

    sudo caddy validate --config /etc/caddy/Caddyfile
    sudo systemctl enable --now caddy
    sudo systemctl reload caddy
    curl -f https://你的域名/healthz

返回 ok 后进入网站测试。

## 验收

1. 两个浏览器用不同昵称进同一房间，互相看见座位和消息。
2. 同时抢同一座位，确认只有一位成功。
3. 切换中英文，播放内置示例，检查新人加入时的进度。
4. 上传真实 MP4，另一台设备验证播放和跳转。
5. 实测常用平台链接。
6. 手机流量和家宽分别测试最终域名。

tests/http.mjs 在本地服务启动后通过 TEST_ORIGIN 指定地址运行。该上传测试使用文件头样本，验证传输和 Range，不验证解码。

## 查询统计

systemd 部署运行。

    sudo -u lecturehall node /srv/lecture-hall/server/usage-report.mjs /var/lib/lecture-hall/hall.sqlite

Docker 部署运行。

    docker compose exec hall node server/usage-report.mjs /data/hall.sqlite

报表按北京时间输出累计 visits、browsers、total_ms，及最近 30 个有数据的日期。active_ms/1000 为前台秒数，总时长除以访问次数得到平均每次停留。浏览器匿名 ID 去重不等于实名人数。

## 备份与升级

systemd 部署在维护窗口停止服务后，备份整个 DATA_DIR，再更新代码、构建测试并启动。数据库运行中使用 SQLite 在线备份方式。

    sudo systemctl stop lecture-hall
    sudo tar -czf /root/lecture-hall-data-backup.tar.gz -C /var/lib lecture-hall
    # 更新源码，然后运行 npm run build 和 npm test
    sudo systemctl start lecture-hall
    sudo systemctl status lecture-hall

Docker 部署停止 hall 服务后备份整个 hall-data 卷，再更新镜像并启动。保留旧代码提交以便回退。数据库、WAL 文件和 uploads 都需要保存，已应用的迁移不要改写。

## 排错

- 域名打不开，检查 A/AAAA、80/443、应用与 Caddy 状态。
- HTTPS 失败，看 journalctl -u caddy，确认域名解析已生效。
- 来源错误，核对 PUBLIC_ORIGIN。
- 应用失败，看 journalctl -u lecture-hall，核对 Node 版本、路径、写入权限。
- 数据丢失，检查 DATA_DIR 或持久卷。
- 上传失败，检查文件格式、200 MB 限制、磁盘配额和反代限制。
