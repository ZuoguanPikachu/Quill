---
title: Python实现分段下载器
date: 2024-05-14 23:16:31
tags: [爬虫, Python]
categories: 编程
index_img: https://zuoguan-piclib-1257172707.cos.ap-guangzhou.myqcloud.com/assets/7.jpg
---
## Range参数
`header`中的`Range`参数：允许客户端请求服务器发送部分资源，而不是整个资源，是实现分段下载的关键。

格式如下：
```json
{
    "Range": "bytes=<start>-<end>"
}
// 前闭后闭
```
只有在响应头中`Accept-Range`参数为`bytes`才有效

## HEAD请求
`HEAD`请求方法与`GET`方法非常相似，但是在服务器响应中只返回头部信息，而不返回实际资源的主体部分。

我们可以用HEAD请求先获取响应头，判断是否支持分段下载以及资源总大小。

## Demo
```python
import httpx
import threading
from urllib.request import getproxies
from concurrent.futures import ThreadPoolExecutor, wait, ALL_COMPLETED
from rich.progress import BarColumn, DownloadColumn, Progress, TextColumn, TimeRemainingColumn, TransferSpeedColumn
from rich.console import Console
from typing import Union, Tuple, Dict
import os
import re
import hashlib
import shutil


def parse_filename_from_url(url: str) -> Union[str, None]:
    match = re.search(r'/([^/]+\.\w+)(?:\?.*)?$', url)
    if match:
        return match.group(1)
    else:
        return None


def md5_encrypt(text: str) -> str:
    md5 = hashlib.md5()
    md5.update(text.encode('utf-8'))

    return md5.hexdigest()


class Downloader:
    def __init__(
            self, url: str,
            n_workers: int = 8,
            dest_dir: str = "./",
            filename: Union[str, None] = None,
            headers: Union[Dict, None] = None,
            proxy: Union[str, None] = None,
            **other_http_params
    ):
        self.url = url
        self.n_workers = n_workers
        self.dest_dir = dest_dir

        if filename is None:
            filename = parse_filename_from_url(self.url)
            if filename is None:
                filename = md5_encrypt(self.url) + ".bin"
        self.filename = filename

        if headers is None:
            headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) "
                              "Chrome/102.0.0.0 Safari/537.36",
            }
        self.headers = headers

        if proxy is None:
            proxy = getproxies().get("http")
        self.proxy = proxy

        self.other_http_params = other_http_params

        self.lock = threading.Lock()
        self.console = Console()
        self.progress = Progress(
            TextColumn("[bold blue]Downloading[/bold blue]", justify="right"),
            BarColumn(bar_width=None),
            "[progress.percentage]{task.percentage:>3.1f}%",
            "•",
            DownloadColumn(),
            "•",
            TransferSpeedColumn(),
            "•",
            TimeRemainingColumn(),
        )
        self.task = None

    def download_chunk(self, headers: Dict[str, str], path: Union[None, str] = None) -> Union[None, bytes]:
        if path is not None:
            with httpx.stream(
                    "GET", self.url, headers=headers, proxy=self.proxy,
                    follow_redirects=True, timeout=30, **self.other_http_params
            ) as r:
                with open(path, "wb") as dest_file:
                    for data in r.iter_bytes():
                        dest_file.write(data)
                        with self.lock:
                            self.progress.update(self.task, advance=len(data))

            return None
        else:
            content = b''
            with httpx.stream(
                    "GET", self.url, headers=headers, proxy=self.proxy,
                    follow_redirects=True, timeout=30, **self.other_http_params
            ) as r:
                for data in r.iter_bytes():
                    content += data
                    with self.lock:
                        self.progress.update(self.task, advance=len(data))

            return content

    def download(self):
        response = httpx.head(
            self.url, headers=self.headers, proxy=self.proxy,
            follow_redirects=True, timeout=30, **self.other_http_params
        )
        total_size = int(response.headers['Content-Length'])

        if (
                "Accept-Ranges" in response.headers and
                response.headers["Accept-Ranges"].lower() == "bytes" and
                total_size > 10 * 1024 * 1024
        ):
            chunk_size = total_size // self.n_workers
            splits = (
                    [(0, chunk_size)] +
                    [(i * chunk_size + 1, (i + 1) * chunk_size) for i in range(1, self.n_workers-1)] +
                    [(chunk_size * (self.n_workers-1) + 1, total_size)]
            )

            if total_size > 100 * 1024 * 1024:
                with self.progress:
                    self.task = self.progress.add_task("download", total=total_size, filename=self.filename)
                    with ThreadPoolExecutor(max_workers=self.n_workers) as pool:
                        all_task = [
                            pool.submit(
                                self.download_chunk,
                                self.add_range(split),
                                os.path.join(self.dest_dir, f"{self.filename}_{i}")
                            ) for (i, split) in enumerate(splits)
                        ]

                        wait(all_task, return_when=ALL_COMPLETED)
                        with open(os.path.join(self.dest_dir, self.filename), "wb") as concatenated_file:
                            for i in range(self.n_workers):
                                with open(os.path.join(self.dest_dir, f"{self.filename}_{i}"), "rb") as file:
                                    shutil.copyfileobj(file, concatenated_file)
                                os.remove(os.path.join(self.dest_dir, f"{self.filename}_{i}"))

            else:
                with self.progress:
                    self.task = self.progress.add_task("download", total=total_size, filename=self.filename)

                    with ThreadPoolExecutor(max_workers=self.n_workers) as pool:
                        all_task = [pool.submit(self.download_chunk, self.add_range(split), None) for split in splits]

                        content = b''
                        for task in all_task:
                            content += task.result()

                        with open(os.path.join(self.dest_dir, self.filename), "wb") as f:
                            f.write(content)
        else:
            with self.progress:
                self.task = self.progress.add_task("download", total=total_size, filename=self.filename)
                self.download_chunk(self.headers, os.path.join(self.dest_dir, self.filename))

    def add_range(self, split: Tuple[int, int]) -> Dict[str, str]:
        headers = self.headers.copy()
        headers["Range"] = f"bytes={split[0]}-{split[1]}"

        return headers
```
以上是一个简易的demo，与IDM等成熟的下载相比，是有很多缺陷的：

1. 一个线程下载结束后，不会去下载其他线程还未下载的部分

2. 下载中断后需要重新下载