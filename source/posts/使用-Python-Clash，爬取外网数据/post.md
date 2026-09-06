---
title: 使用 Python + Clash，爬取外网数据
date: 2023-02-24 18:38:48
tags: [爬虫, 代理, Python]
categories: 编程
index_img: https://zuoguan-piclib-1257172707.cos.ap-guangzhou.myqcloud.com/assets/2.jpg
---
有的时候，希望能够爬取一些外网的数据，但是开启`Clash`之类的软件后，发现会直接报`requests.exceptions.ProxyError`的错误。解决方法的代码如下：
```python
import requests
import urllib3


# 设置了verify=False后(在后面)会有警告，关闭警告
urllib3.disable_warnings()

url = "https://www.google.com"

# Clash默认的代理端口为7890
proxies = {
    'http': 'http://127.0.0.1:7890/',
    'https': 'http://127.0.0.1:7890/'
}

response = requests.get(url=url, verify=False, proxies=proxies)
```
将代理的IP地址以及端口号写死的做法并不优雅，可以使用`urllib.request`中的`getproxies`获取系统Web代理信息。当未开启代理时，返回空字典，开启代理时，返回如下的字典：
```json
{
    'http': 'http://127.0.0.1:7890',
 	'https': 'https://127.0.0.1:7890',
 	'ftp': 'ftp://127.0.0.1:7890'
}
```
`urllib3.disable_warnings()`这样的代码也不够优雅。使用`httpx`则不用设置`urllib3.disable_warnings()`、`verify=False`。
```python
from urllib.request import getproxies
import httpx


response = httpx.get(
	"https://www.google.com/",
    proxy=getproxies().get("http")
)
```
也可以使用`Client`，和`requests`的`session`基本一致
```python
from urllib.request import getproxies
import httpx


client = httpx.Client(
    proxy=getproxies().get("http")
)

response = client.get("https://www.google.com/")
```

