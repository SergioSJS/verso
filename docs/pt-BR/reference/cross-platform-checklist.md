# Escrito no Mac, certo no Windows: o checklist

- Data: 2026-10-08
- Por quê: o mantenedor decidiu que o porte para Windows é escrito pensando
  no Windows desde o começo ([ADR 0069](../adr/0069-windows-port.md),
  Consequências). O primeiro build de Windows, em 2026-10-07 e 08, precisou
  de cada correção abaixo; cada uma era um hábito que funciona no macOS e
  falha no Windows. Isto é o que fazer no lugar, para a próxima mudança não
  repeti-los.
- Como checar: o `scripts/check.sh` roda os testes de ponta a ponta no
  Chromium (o motor do WebView2) ao lado do WebKit; o
  `scripts/check-windows.sh` roda o clippy e os testes numa máquina Windows.
  Uma mudança que toca arquivos, caminhos, processos, configuração ou o foco
  e as teclas da janela lê isto antes.

## 1. Caminhos

| Hábito que falha no Windows | O que aconteceu | Escreva assim |
|---|---|---|
| `Path::join`/`push` para montar um caminho relativo à pasta | `\` foi parar no `"file"` de um board e em `[[npcs\Barão]]` | `crate::rel_join` no `verso-fs` (`/` em todo sistema); o disco só pelo `on_disk` |
| `to_string_lossy()` de um caminho do sistema, depois guardado ou mostrado | o índice e o contrato receberam `\` | caminhos relativos já são `/`; nunca transforme um absoluto em texto (invariante 4) |
| um teste afirma `"pasta/C.md"` sobre um caminho montado pelo sistema | falhou só no Windows | monte o esperado e o real do mesmo jeito, ou junte componentes com `/` |
| um nome digitado pelo usuário, criado como está | `CON.md`, `a:b.md`, `nota?` não existem no Windows; uma pasta sincronizada quebra | nomes que todo sistema guarda ([ADR 0070](../adr/0070-what-travels-with-the-folder.md)); os arquivos do próprio tutorial também (o `demo-vault.mjs check` recusa um) |
| checar ponto no fim do nome sem a extensão | recusou `nota.`, cujo arquivo `nota..md` o Windows guarda | cheque o nome inteiro do arquivo |
| `a:b` num caminho de teste | o Windows lê `A:` como drive (recusado como absoluto, não como nome) | espere uma recusa ou outra |

## 2. Arquivos e o disco

| Hábito | O que aconteceu | No lugar |
|---|---|---|
| `File::open(dir)?.sync_all()` | o Windows se recusa a abrir um diretório assim | `os::sync_dir` (acesso de escrita + `FILE_FLAG_BACKUP_SEMANTICS`) |
| `std::fs::rename` uma vez | um antivírus ou o indexador segurando o arquivo faz falhar | `os::rename` (tenta de novo por ~2,5 s) |
| renomear uma pasta com um arquivo aberto dentro | "Access is denied" | feche os arquivos antes; nos testes, `Kept` (um `TempPath` fechado) em vez de `NamedTempFile` |
| `std::os::unix::fs::MetadataExt` (`dev`, `ino`, `nlink`, `uid`) | não compilava | `os::file_id`, `os::link_count`, `os::same_owner` |
| um `compile_error!` para "não é Unix" | o workspace inteiro parava | uma metade Windows no `verso-fs/src/os.rs` |
| um crate só de Unix (`xattr`) como dependência em todo sistema | não compilava | `[target.'cfg(unix)'.dependencies]`; cheque com `cargo tree --target x86_64-pc-windows-msvc` |
| tomar um evento do watcher como mudança, qualquer que seja o tipo | ler notas fazia o Windows dizer que a pasta foi "modificada": o índice entrava em loop | filtre o que o sistema relata sobre si mesmo (`directory_touched_only`) |
| um teste escrevendo por `Workspace::open(dir, None)` | 1167 índices deixados na pasta de configuração real do usuário | sempre passe uma pasta de configuração nos testes |

## 3. Processos, configuração, executáveis

| Hábito | O que aconteceu | No lugar |
|---|---|---|
| `HOME` para a pasta de configuração | não existe no Windows: o app não iniciaria | `config_dir()` (`%APPDATA%\verso` lá); a do Claude Desktop é `%APPDATA%\Claude` |
| um binário chamado `verso-app` | o CLI nunca achava o `verso-app.exe` | `std::env::consts::EXE_SUFFIX` |
| `/usr/bin/true`, `/usr/local/bin`, `open -a`, `osascript` | não existem no Windows | `cfg` por sistema, um caminho de Windows ou um "ainda não nesta plataforma" explícito |
| um teste chamando `ln`, `chmod`, `test`, `touch`, `sh` | "program not found" | os auxiliares por sistema do `tests/workspace/shell.rs` (`mklink`, `icacls`, `cmd`, PowerShell) |
| uma variável ou função usada só em alguns ramos de `cfg` | o clippy `-D warnings` falhava no Windows | `cfg` na função, ou `let _ = x;` no outro ramo — nunca `#[allow]` |
| uma entrada do `clippy.toml` nomeando `std::os::unix::…` | "does not refer to a reachable function" no Windows | `allow-invalid = true` nas entradas de cada sistema |
| uma janela ou web view criada num `#[tauri::command]` síncrono | uma janela branca no Windows (wry#583) | faça o comando `async` |

## 4. A janela (o WebView2 é Chromium)

| Hábito | O que aconteceu | No lugar |
|---|---|---|
| contar com um clique que não foca o botão (o WebKit nunca foca) | o F2 renomeava a linha clicada; as teclas do board morriam depois de um clique no menu | tire o foco depois de um clique do mouse (`e.detail > 0`), ou `onMouseDown={(e) => e.preventDefault()}` nos botões que devem deixar o foco onde estava |
| um `finish` de campo que remove o campo, guardado por `isConnected` ou por nada | o Chromium dispara `blur` dentro de `remove()`/`replaceWith()`: o Enter lançava erro, o Esc salvava | uma flag `done` marcada antes da remoção |
| um nome recusado registrado com `fail()` | um ERROR no log para uma resposta | `nameTaken()` (INFO) |
| os scripts de um arquivo HTML | o Chromium registra "Blocked script execution" por causa do sandbox | esperado: a página não roda script, de propósito |

## 5. Testes, CI e ferramentas

| Hábito | O que aconteceu | No lugar |
|---|---|---|
| o harness de teste do app sem o manifesto do app | `STATUS_ENTRYPOINT_NOT_FOUND` | o `build.rs` embute o `windows-app-manifest.xml` em todo binário |
| testes de IPC chamando de `tauri://localhost` | recusados pela capability no Windows | `APP_ORIGIN` (`http://tauri.localhost` no WebView2) |
| a conversão de fim de linha do Git num runner Windows | as fixtures mudariam | `git config --global core.autocrlf false` antes do checkout |
| `npm` a partir do PowerShell | a política de execução padrão recusa o `npm.ps1` | `npm.cmd` |
| o CLI do Tauri rodado de `app/ui` | "not a Tauri project" | rode da raiz da árvore (`npm --prefix app/ui exec -- tauri …`) |
| mandar texto pela entrada do PowerShell 5.1 | acentos estragados; arrays de JSON não enumerados; aspas perdidas em argumentos nativos | arquivos por `scp`; passe por uma variável; um arquivo `.cmd` para argumentos com aspas |
| um `?` num pathspec do git | lido como curinga | `':(literal)caminho'` |
