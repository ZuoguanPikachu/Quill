---
title: 文件重命名为MD5：从脚本到右键菜单
date: 2024-12-15 19:13:17
tags: [Windows, 注册表, Python]
categories: 计算机
index_img: https://zuoguan-piclib-1257172707.cos.ap-guangzhou.myqcloud.com/assets/14.jpg
---

有的时候希望将MD5直接作为文件名，于是就想实现这样一个功能：右键一个/多个文件时，菜单中出现一个选项：MD5 Rename，点击后会将文件重命名为其MD5值

## 编写脚本

创建一个脚本来计算文件的 MD5 值并重命名文件

```python
import hashlib
import os
import sys
import tkinter.messagebox as messagebox


def get_file_md5(file_path):
    """计算文件的MD5值"""
    md5_hash = hashlib.md5()
    try:
        with open(file_path, 'rb') as f:
            while chunk := f.read(8192):
                md5_hash.update(chunk)
        return md5_hash.hexdigest()
    except Exception as e:
        messagebox.showerror("Error", f"Error reading file {file_path}: {e}")
        return None

def rename_file(file_path):
    """将文件重命名为其MD5值"""
    md5_value = get_file_md5(file_path)
    if md5_value:
        new_name = os.path.join(os.path.dirname(file_path), md5_value + os.path.splitext(file_path)[1])
        try:
            os.rename(file_path, new_name)
        except Exception as e:
            messagebox.showerror("Error", f"Error renaming file {file_path}: {e}")
    else:
        messagebox.showwarning("Warning", f"Could not compute MD5 for {file_path}")

def main():
    if len(sys.argv) < 2:
        messagebox.showwarning("Warning", "No files provided!")
        return

    for file_path in sys.argv[1:]:
        file_path = file_path.strip('"')
        if os.path.isfile(file_path):
            rename_file(file_path)
        else:
            messagebox.showwarning("Warning", f"{file_path} is not a valid file")

if __name__ == "__main__":
    main()
```

## 注册右键菜单

1. 打开注册表

2. 来到`计算机\HKEY_CLASSES_ROOT\*\Shell\`

3. 新建一个项，命名为`MD5 Rename`

4. 在`MD5 Rename`下再新建一个项，命名为`command`

5. 双击 `command` 中的默认值，设置为要执行的命令

   ```
   "C:\path\to\pythonw.exe" "C:\path\to\md5_rename.py" %1
   ```

## 其他事项

1. 一定要填写完整的python路径，无论是否添加了环境变量
2. 如果同时选中多个文件，并不会进入for循环
3. ChatGPT提供的方法中说， `%1` 替换为 `%*`，可以实现批量操作。我尝试后，结果是并不可行
