---
title: 快速搭建一个Local File Server
date: 2024-10-25 13:19:45
tags: [Flask, Python, 防火墙]
categories: 编程
index_img: https://zuoguan-piclib-1257172707.cos.ap-guangzhou.myqcloud.com/assets/10.jpg
---
最近整了一些里番，打算细细评鉴。当然是躺在床上评鉴最为惬意。虽然有移动硬盘，也有转接头，但是似乎是华为手机的问题，连上后会自动生成一些文件，而且还难以删除，我接受不了。因为在家里，手机和电脑在同一局域网，那就用Python搭建一个本地文件服务器好了。

## 代码实现
```python
from flask import Flask, send_file, abort, render_template_string
from gevent.pywsgi import WSGIServer
import os
import socket
import qrcode

app = Flask(__name__)


HTML_TEMPLATE = '''
<!DOCTYPE html>
<html lang="zh">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet" integrity="sha384-QWTKZyjpPEjISv5WaRU9OFeRpok6YctnYmDr5pNlyT2bRjXh0JMhjY6hW+ALEwIH" crossorigin="anonymous">
    <title>Local File Server</title>
    <style>
        a { color: #007bff; text-decoration: none; }
        a:visited { color: #007bff; }
    </style>
</head>
<body>
    <div class="container">
            <table class="table table-hover">
        <thead>
            <tr>
                <th>File Name</th>
            </tr>
        </thead>
        
        <tbody>
            {% for file in files %}
                <tr>
                    <td><a href="/{{ file[1] }}">{{ file[0] }}</a></td>
                </tr>
            {% endfor %}
        </tbody>
    </table>
    </div>
</body>
</html>
'''


@app.route('/<path:filename>')
def serve_file(filename):
    if not os.path.exists(filename):
        abort(404)

    if os.path.isfile(filename):
        return send_file(os.path.join(os.getcwd(), filename))
    else:
        return render_template(filename)


@app.route('/')
def index():
    return render_template("./")


def render_template(path):
    files = os.listdir(path)
    files_path = map(
        lambda file: os.path.join(path, file), files
    )

    return render_template_string(HTML_TEMPLATE, files=zip(files, files_path))


def get_local_ip():
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.connect(("8.8.8.8", 80))
    local_ip = sock.getsockname()[0]

    return local_ip


if __name__ == '__main__':
    ip = get_local_ip()
    port = 1128

    url = "http://{}:{}".format(ip, port)
    print("Server running at {}".format(url))

    qr = qrcode.QRCode(
        version=5,
        error_correction=qrcode.constants.ERROR_CORRECT_Q,
        box_size=10,
        border=4,
    )
    qr.add_data(url)
    qr.print_ascii()

    http_server = WSGIServer(('0.0.0.0', port), app, log=None)
    http_server.serve_forever()
```
## 一些小问题
测试时一切顺利。然而，到了晚上，我要开始细细品鉴时，却发现手机无法访问，而电脑端可以正常访问。

经过排查与测试，原因很可能时这样的：程序第一次运行的时候，Windows会询问是否允许通过防火墙，允许后即可正常运行。第二次运行就不会再询问了。但是，因为程序是在移动硬盘里的，重新连接移动硬盘后，一些奇奇怪怪的、我也不太清楚的机制，使得这个程序没有被允许通过防火墙了。

我的解决方法就是新建一个`入站规则`，让`1128`端口总是允许连接（特意选的一个不常见的端口号）。