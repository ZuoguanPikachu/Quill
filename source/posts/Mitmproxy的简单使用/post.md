---
title: Mitmproxy的简单使用
date: 2025-08-04 09:17:31
tags: [爬虫, 代理, Python]
categories: 编程
index_img: https://zuoguan-piclib-1257172707.cos.ap-guangzhou.myqcloud.com/assets/21.jpg
---

`mitmproxy` 是一个功能强大的交互式中间人代理（MITM，Man-In-The-Middle Proxy），支持 HTTP、HTTPS 和 WebSocket，可以用于抓包、修改请求和响应。



## 基本用法

### 1. 启动 mitmproxy（默认监听 8080 端口）

```bash
mitmproxy
```

或者使用 Web UI：

```bash
mitmweb
```

默认监听地址为 `http://127.0.0.1:8080`，Web UI 地址为 `http://127.0.0.1:8081`

### 2. 设置代理

在你要抓包的设备中，手动设置 HTTP/HTTPS 代理

### 3. 安装 mitmproxy 证书（用于 HTTPS 解密）

* 在浏览器中访问`http://mitm.it`

- 下载并安装相应平台的根证书，并进行安装



## 代理

很早就听说过`mitmproxy`了，但是因为不知道要手动设置系统代理，所以一直不知道该怎么用，毕竟其他抓包工具都是自动设置代理的。

### Clash也需要系统代理？

#### 方法1、Clash作为上游代理

指定 Clash 作为上游代理（127.0.0.1:7897）：

```bash
mitmproxy --mode upstream:http://127.0.0.1:7897
```

将系统代理设置为 `127.0.0.1:8080`

#### 方法2、Clash启用TUN模式

TUN 模式：通过内核 TUN 虚拟网卡机制，将整个系统的所有流量（包括不遵守系统代理设置的应用）强制路由到 Clash 进行分流，而不依赖系统代理。

### 自动设置系统代理

自己手动设置代理还是太麻烦了，我们可以使用Python自动设置系统代理

```python
import winreg
import ctypes


def set_system_proxy(proxy_server='127.0.0.1', proxy_port=8080, enable=True):
    """
    修改 Windows 系统代理设置。
    :param proxy_server: 代理服务器地址
    :param proxy_port: 代理端口
    :param enable: 是否启用代理
    """
    # 注册表路径
    reg_path = r"Software\Microsoft\Windows\CurrentVersion\Internet Settings"

    try:
        # 打开注册表项
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, reg_path, 0, winreg.KEY_WRITE) as reg_key:

            # 设置代理启用状态 (1: 启用, 0: 禁用)
            winreg.SetValueEx(reg_key, "ProxyEnable", 0, winreg.REG_DWORD, 1 if enable else 0)

            # 设置代理服务器地址和端口
            proxy_string = f"{proxy_server}:{proxy_port}"
            winreg.SetValueEx(reg_key, "ProxyServer", 0, winreg.REG_SZ, proxy_string)

            # 可选：设置不使用代理的地址（绕过代理）
            bypass = "localhost;127.0.0.1;<local>"
            winreg.SetValueEx(reg_key, "ProxyOverride", 0, winreg.REG_SZ, bypass)

        # 通知系统代理设置已更改
        ctypes.windll.Wininet.InternetSetOptionW(0, 39, 0, 0)  # 39 = INTERNET_OPTION_SETTINGS_CHANGED
        ctypes.windll.Wininet.InternetSetOptionW(0, 37, 0, 0)  # 37 = INTERNET_OPTION_REFRESH

        if enable:
            print("代理已开启！")
        else:
            print("代理已关闭！")

    except Exception as e:
        print(f"设置代理时出错: {e}")


def get_system_proxy():
    """
    读取当前系统代理设置。
    """
    reg_path = r"Software\Microsoft\Windows\CurrentVersion\Internet Settings"

    try:
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, reg_path, 0, winreg.KEY_READ) as reg_key:
            # 读取代理启用状态
            proxy_enable, _ = winreg.QueryValueEx(reg_key, "ProxyEnable")
            proxy_server, _ = winreg.QueryValueEx(reg_key, "ProxyServer")

        print(f"代理状态: {'启用' if proxy_enable else '禁用'}")
        print(f"代理服务器: {proxy_server if proxy_server else '无'}")

    except Exception as e:
        print(f"读取代理设置时出错: {e}")

```



## 脚本

编写脚本，使用 `mitmdump` 执行，进行拦截、修改请求或响应

1. 创建脚本 `modify.py`：

   ```python
   from mitmproxy import http
   
   def request(flow: http.HTTPFlow):
       if "api.example.com" in flow.request.pretty_url:
           flow.request.headers["X-Debug"] = "true"
   
   def response(flow: http.HTTPFlow):
       if flow.response.content:
           flow.response.text = flow.response.text.replace("original", "modified")
   
   ```

2. 启动 `mitmdump` 加载脚本：

   ```bash
   mitmdump -s modify.py
   ```



## 嵌入

使用`mitmdump`似乎不是很方便，用着不习惯。更希望把`mitmproxy` 当作 Python 库在你自己的 Python 程序中调用，也就是将 `mitmproxy` 作为一个嵌入式代理服务（embedded proxy）来运行。

以下是一份demo代码（含自动启用系统代理）

```python
from mitmproxy.tools.dump import DumpMaster
from mitmproxy.options import Options
from mitmproxy import http, addonmanager
import asyncio
import atexit


class MyAddon:
    def request(self, flow: http.HTTPFlow):
        if "api.example.com" in flow.request.pretty_url:
            flow.request.headers["X-Debug"] = "true"

    def response(self, flow: http.HTTPFlow):
        if flow.response.content:
            flow.response.text = flow.response.text.replace("original", "modified")


async def run_proxy():
    options = Options(listen_host="127.0.0.1", listen_port=8080)
    dump_master = DumpMaster(options, with_termlog=False, with_dumper=False)
    dump_master.addons.add(MyAddon())

    set_system_proxy('127.0.0.1', 8080)

    print('启动 mitmproxy\n')
    await dump_master.run()
            
            
def on_exit():
    set_system_proxy(enable=False)


if __name__ == "__main__":
    atexit.register(on_exit)
    try:
        asyncio.run(run_proxy())
    except KeyboardInterrupt:
        exit()

```

