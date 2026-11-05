# 电视应用构建、安装与排错

电视应用位于 `tv-app/`，是标准 Tizen Web 应用。本文说明如何打包 `.wgt`、侧载到电视，以及这台 2015 款 J 系列电视的特殊限制。

应用信息：

| 项目 | 值 |
| --- | --- |
| Widget ID | `http://tizenlan.local/MediaBrowser` |
| Package ID | `TizenLANTV`（安装要求至少 10 个字符） |
| Application ID | `TizenLANTV.MediaBrowser` |
| 入口 | `index.html` |
| Profile | `tv` |
| required_version | `2.3` |
| 显示名称 | 局域网媒体 |
| 产物 | `dist\局域网媒体.wgt` |

## 环境

本项目直接复用 `D:\TizenRD` 里已经装好的工具：

| 用途 | 路径 |
| --- | --- |
| Tizen CLI | `D:\TizenRD\tools\tizen-sdk\tools\ide\bin\tizen.bat` |
| sdb | `D:\TizenRD\tools\tizen-sdk\tools\sdb.exe` |
| signing profile | `TizenRDTest`（普通 Tizen 测试证书） |

`tools\build-tv.ps1` 会自动找到这个 CLI；也可以用 `-TizenCli` 显式指定。查看已有 profile：

```powershell
D:\TizenRD\tools\tizen-sdk\tools\ide\bin\tizen.bat security-profiles list
```

如果 profile 丢失，按 `D:\TizenRD\docs\TIZEN-BUILD.md` 第 3 节重新生成。**不要**把 `.p12`、密码文件提交到仓库。

## 打包

```powershell
cd D:\TIzenLAN
powershell -ExecutionPolicy Bypass -File tools\build-tv.ps1
```

参数：

| 参数 | 说明 |
| --- | --- |
| `-Profile` | 默认 `TizenRDTest`；这台 2015 电视只能用测试证书 |
| `-TizenCli` | 指定 `tizen.bat` |
| `-OutDir` | 输出目录，默认 `dist` |
| `-InstallTarget` | 形如 `192.168.3.83:26101`，打包后自动连接并安装 |

脚本会清理 `tv-app\.buildResult`、执行 `tizen build-web`、再用指定 profile 打包。Tizen 用 `config.xml` 的 `<name>` 命名 `.wgt`，所以文件名是中文。

手动命令等价于：

```bat
cd tv-app
D:\TizenRD\tools\tizen-sdk\tools\ide\bin\tizen.bat build-web -e ".*" -e "node_modules" -- .
D:\TizenRD\tools\tizen-sdk\tools\ide\bin\tizen.bat package -t wgt -s TizenRDTest -o ..\dist -- .buildResult
```

## 安装到电视

### 1. 电视开启开发者模式

1. 电视进入 **Apps（应用）** 面板。
2. 遥控器输入 `12345`，出现 Developer Mode 对话框。
3. Developer mode 设为 On。
4. Host PC IP 填运行打包脚本的电脑 IP（如 `192.168.3.88`）。
5. 关闭对话框并**重启电视**（必须）。

### 2. 连接

```powershell
D:\TizenRD\tools\tizen-sdk\tools\sdb.exe connect 192.168.3.83:26101
D:\TizenRD\tools\tizen-sdk\tools\sdb.exe devices
```

首次连接电视会弹出授权提示，需要在电视上允许。`devices` 中显示 `192.168.3.83:26101` 即成功。

### 3. 安装

```powershell
powershell -ExecutionPolicy Bypass -File tools\build-tv.ps1 -InstallTarget 192.168.3.83:26101
```

或手动：

```powershell
D:\TizenRD\tools\tizen-sdk\tools\ide\bin\tizen.bat install -n "D:\TIzenLAN\dist\局域网媒体.wgt" -s 192.168.3.83:26101
```

经典 CLI 的 `install` / `run` / `uninstall` 用 `-s <serial>`（如 `192.168.3.83:26101`），不要用 `-t`。

### 4. 启动

安装完成后直接在电视的应用列表里打开“局域网媒体”。

这台 2015 固件关闭了 sdb shell 通道（`sdb shell` 返回 `closed`），所以 `tizen run` 会失败；这不是安装失败。应用内也没有 `console.log` 输出通道，排查只能靠界面提示和电脑端中转服务日志。

## 更新与卸载

- 更新：修改 `tv-app/` 后重新打包，对同一台电视再次 `tizen install` 覆盖升级。
- 卸载：

```powershell
D:\TizenRD\tools\tizen-sdk\tools\ide\bin\tizen.bat uninstall -p TizenLANTV.MediaBrowser -s 192.168.3.83:26101
```

卸载会清除电视上保存的共享列表和中转服务地址。

## 证书说明（这台电视）

UA55JU5920（2015 年固件，Tizen 2.3）的实测结果：

- 三星 VD Public CA 签发、DUID 正确绑定的包：安装报 `PKGMGR_ERROR`，老固件不认 2025 年的新 CA 链。
- `TizenRDTest`（普通 Tizen 测试证书）签名的包：可以正常安装和运行。

因此本项目默认使用 `TizenRDTest`。如果换成较新的三星电视，需要按那台电视的 DUID 重新签发三星证书并使用对应 profile。

## 常见错误

| 错误 | 原因与处理 |
| --- | --- |
| `sdb devices` 为空 | 开发者模式未开、Host PC IP 填错、电视未重启、首次连接未在电视上允许 |
| `failed to connect` | 电视关机或 IP 变化；先在电脑上 `ping <电视IP>` 并确认 `192.168.x.x:26101` 可达 |
| 26101 端口可达但仍 `failed to connect` | 电视开发者设置里的 Host PC IP 与电脑当前地址不一致。多网卡电脑要填与电视同网段的地址（如 `192.168.3.88`，不是 `10.x`），改完重启电视再 `sdb connect` |
| `PKGMGR_ERROR` | 用了这台电视不认的证书（见上文）；或 Package ID 少于 10 字符；或装成了旧包 |
| `Invalid certificate chain` | 用了 Tizen/Samsung 自带分发证书，换 `TizenRDTest` |
| 打包提示找不到 profile | profile 名与 `-Profile` 不一致，先 `security-profiles list` |
| 安装成功但 `tizen run` 失败 | 2015 固件关闭 sdb shell，直接在电视应用列表打开 |
| 应用打开后停在启动画面 | 先确认 `tv-app/js` 文件都打包进去了；再检查 `config.xml` 的 required_version 是否为 2.3 |
| 电视连不上 host | 填电脑局域网 IP 而不是 `127.0.0.1`；电脑端 `http://IP:8099/api/health` 能打开；防火墙放行 8099 |

## 界面预览

不装电视也能检查界面：

```powershell
cd D:\TIzenLAN\host
npm run preview
```

然后在电脑浏览器打开 <http://127.0.0.1:18099/app/>。`preview` 会同时启动 FTP 测试服务器（`demo / demo123`，根目录 `host/test/data`）。host 默认配置下则使用 <http://127.0.0.1:8099/app/>。
