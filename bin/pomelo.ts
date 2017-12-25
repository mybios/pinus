#!/usr/bin/env node

/**
 * Module dependencies.
 */
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import * as util from 'util'
import * as cliff from 'cliff'
import * as mkdirp from 'mkdirp'
import { ConsoleModule as co } from '../lib/modules/console'
import * as utils from '../lib/util/utils'
import * as starter from '../lib/master/starter'
import { exec } from 'child_process'
import { spawn } from 'child_process'
var version = require('../../package.json').version
import { AdminClient } from 'pomelo-admin'
import * as constants from '../lib/util/constants'
import * as program from 'commander';

/**
 *  Constant Variables
 */
var TIME_INIT = 1 * 1000;
var TIME_KILL_WAIT = 5 * 1000;
var KILL_CMD_LUX = 'kill -9 `ps -ef|grep node|awk \'{print $2}\'`';
var KILL_CMD_WIN = 'taskkill /im node.exe /f';

var CUR_DIR = process.cwd();
var DEFAULT_GAME_SERVER_DIR = CUR_DIR;
var DEFAULT_USERNAME = 'admin';
var DEFAULT_PWD = 'admin';
var DEFAULT_ENV = 'development';
var DEFAULT_MASTER_HOST = '127.0.0.1';
var DEFAULT_MASTER_PORT = 3005;

var CONNECT_ERROR = 'Fail to connect to admin console server.';
var FILEREAD_ERROR = 'Fail to read the file, please check if the application is started legally.';
var CLOSEAPP_INFO = 'Closing the application......\nPlease wait......';
var ADD_SERVER_INFO = 'Successfully add server.';
var RESTART_SERVER_INFO = 'Successfully restart server.';
var INIT_PROJ_NOTICE = ('\nThe default admin user is: \n\n' + '  username' as any).green + ': admin\n  ' + ('password' as any).green + ': admin\n\nYou can configure admin users by editing adminUser.json later.\n ';
var SCRIPT_NOT_FOUND = ('Fail to find an appropriate script to run,\nplease check the current work directory or the directory specified by option `--directory`.\n' as any).red;
var MASTER_HA_NOT_FOUND = ('Fail to find an appropriate masterha config file, \nplease check the current work directory or the arguments passed to.\n' as any).red;
var COMMAND_ERROR = ('Illegal command format. Use `pomelo --help` to get more info.\n' as any).red;
var DAEMON_INFO = 'The application is running in the background now.\n';

program.version(version);

program.command('init [path]')
    .description('create a new application')
    .action(function (path)
    {
        init(path || CUR_DIR);
    });

program.command('start')
    .description('start the application')
    .option('-e, --env <env>', 'the used environment', DEFAULT_ENV)
    .option('-D, --daemon', 'enable the daemon start')
    .option('-d, --directory, <directory>', 'the code directory', DEFAULT_GAME_SERVER_DIR)
    .option('-t, --type <server-type>,', 'start server type')
    .option('-i, --id <server-id>', 'start server id')
    .action(function (opts)
    {
        start(opts);
    });

program.command('list')
    .description('list the servers')
    .option('-u, --username <username>', 'administration user name', DEFAULT_USERNAME)
    .option('-p, --password <password>', 'administration password', DEFAULT_PWD)
    .option('-h, --host <master-host>', 'master server host', DEFAULT_MASTER_HOST)
    .option('-P, --port <master-port>', 'master server port', DEFAULT_MASTER_PORT)
    .action(function (opts)
    {
        list(opts);
    });

program.command('add')
    .description('add a new server')
    .option('-u, --username <username>', 'administration user name', DEFAULT_USERNAME)
    .option('-p, --password <password>', 'administration password', DEFAULT_PWD)
    .option('-h, --host <master-host>', 'master server host', DEFAULT_MASTER_HOST)
    .option('-P, --port <master-port>', 'master server port', DEFAULT_MASTER_PORT)
    .action(function ()
    {
        var args = [].slice.call(arguments, 0);
        var opts = args[args.length - 1];
        opts.args = args.slice(0, -1);
        add(opts);
    });

program.command('stop')
    .description('stop the servers, for multiple servers, use `pomelo stop server-id-1 server-id-2`')
    .option('-u, --username <username>', 'administration user name', DEFAULT_USERNAME)
    .option('-p, --password <password>', 'administration password', DEFAULT_PWD)
    .option('-h, --host <master-host>', 'master server host', DEFAULT_MASTER_HOST)
    .option('-P, --port <master-port>', 'master server port', DEFAULT_MASTER_PORT)
    .action(function ()
    {
        var args = [].slice.call(arguments, 0);
        var opts = args[args.length - 1];
        opts.serverIds = args.slice(0, -1);
        terminal('stop', opts);
    });

program.command('kill')
    .description('kill the application')
    .option('-u, --username <username>', 'administration user name', DEFAULT_USERNAME)
    .option('-p, --password <password>', 'administration password', DEFAULT_PWD)
    .option('-h, --host <master-host>', 'master server host', DEFAULT_MASTER_HOST)
    .option('-P, --port <master-port>', 'master server port', DEFAULT_MASTER_PORT)
    .option('-f, --force', 'using this option would kill all the node processes')
    .action(function ()
    {
        var args = [].slice.call(arguments, 0);
        var opts = args[args.length - 1];
        opts.serverIds = args.slice(0, -1);
        terminal('kill', opts);
    });

program.command('restart')
    .description('restart the servers, for multiple servers, use `pomelo restart server-id-1 server-id-2`')
    .option('-u, --username <username>', 'administration user name', DEFAULT_USERNAME)
    .option('-p, --password <password>', 'administration password', DEFAULT_PWD)
    .option('-h, --host <master-host>', 'master server host', DEFAULT_MASTER_HOST)
    .option('-P, --port <master-port>', 'master server port', DEFAULT_MASTER_PORT)
    .option('-t, --type <server-type>,', 'start server type')
    .option('-i, --id <server-id>', 'start server id')
    .action(function (opts)
    {
        restart(opts);
    });

program.command('masterha')
    .description('start all the slaves of the master')
    .option('-d, --directory <directory>', 'the code directory', DEFAULT_GAME_SERVER_DIR)
    .action(function (opts)
    {
        startMasterha(opts);
    });

program.command('*')
    .action(function ()
    {
        console.log(COMMAND_ERROR);
    });

program.parse(process.argv);

/**
 * Init application at the given directory `path`.
 *
 * @param {String} path
 */
function init(path)
{
    console.log(INIT_PROJ_NOTICE);
    connectorType(function (type)
    {
        emptyDirectory(path, function (empty)
        {
            if (empty)
            {
                process.stdin.destroy();
                createApplicationAt(path, type);
            } else
            {
                confirm('Destination is not empty, continue? (y/n) [no] ', function (force)
                {
                    process.stdin.destroy();
                    if (force)
                    {
                        createApplicationAt(path, type);
                    } else
                    {
                        abort(('Fail to init a project' as any).red);
                    }
                });
            }
        });
    });
}

/**
 * Create directory and files at the given directory `path`.
 *
 * @param {String} ph
 */
function createApplicationAt(ph, type)
{
    var name = path.basename(path.resolve(CUR_DIR, ph));
    copy(path.join(__dirname, '../../template/'), ph);
    mkdir(path.join(ph, 'game-server/logs'));
    mkdir(path.join(ph, 'shared'));
    // rmdir -r
    var rmdir = function (dir)
    {
        var list = fs.readdirSync(dir);
        for (var i = 0; i < list.length; i++)
        {
            var filename = path.join(dir, list[i]);
            var stat = fs.statSync(filename);
            if (filename === "." || filename === "..")
            {
            } else if (stat.isDirectory())
            {
                rmdir(filename);
            } else
            {
                fs.unlinkSync(filename);
            }
        }
        fs.rmdirSync(dir);
    };
    setTimeout(function ()
    {
        switch (type)
        {
            case '1':
                // use websocket
                var unlinkFiles = ['game-server/app.ts.sio',
                    'game-server/app.ts.wss',
                    'game-server/app.ts.mqtt',
                    'game-server/app.ts.sio.wss',
                    'game-server/app.ts.udp',
                    'web-server/app.ts.https',
                    'web-server/public/index.html.sio',
                    'web-server/public/js/lib/pomeloclient.ts',
                    'web-server/public/js/lib/pomeloclient.ts.wss',
                    'web-server/public/js/lib/build/build.ts.wss',
                    'web-server/public/js/lib/socket.io.ts'];
                for (var i = 0; i < unlinkFiles.length; ++i)
                {
                    fs.unlinkSync(path.resolve(ph, unlinkFiles[i]));
                }
                break;
            case '2':
                // use socket.io
                var unlinkFiles = ['game-server/app.ts',
                    'game-server/app.ts.wss',
                    'game-server/app.ts.udp',
                    'game-server/app.ts.mqtt',
                    'game-server/app.ts.sio.wss',
                    'web-server/app.ts.https',
                    'web-server/public/index.html',
                    'web-server/public/js/lib/component.tson',
                    'web-server/public/js/lib/pomeloclient.ts.wss'];
                for (var i = 0; i < unlinkFiles.length; ++i)
                {
                    fs.unlinkSync(path.resolve(ph, unlinkFiles[i]));
                }

                fs.renameSync(path.resolve(ph, 'game-server/app.ts.sio'), path.resolve(ph, 'game-server/app.ts'));
                fs.renameSync(path.resolve(ph, 'web-server/public/index.html.sio'), path.resolve(ph, 'web-server/public/index.html'));

                rmdir(path.resolve(ph, 'web-server/public/js/lib/build'));
                rmdir(path.resolve(ph, 'web-server/public/js/lib/local'));
                break;
            case '3':
                // use websocket wss
                var unlinkFiles = ['game-server/app.ts.sio',
                    'game-server/app.ts',
                    'game-server/app.ts.udp',
                    'game-server/app.ts.sio.wss',
                    'game-server/app.ts.mqtt',
                    'web-server/app.ts',
                    'web-server/public/index.html.sio',
                    'web-server/public/js/lib/pomeloclient.ts',
                    'web-server/public/js/lib/pomeloclient.ts.wss',
                    'web-server/public/js/lib/build/build.ts',
                    'web-server/public/js/lib/socket.io.ts'];
                for (var i = 0; i < unlinkFiles.length; ++i)
                {
                    fs.unlinkSync(path.resolve(ph, unlinkFiles[i]));
                }

                fs.renameSync(path.resolve(ph, 'game-server/app.ts.wss'), path.resolve(ph, 'game-server/app.ts'));
                fs.renameSync(path.resolve(ph, 'web-server/app.ts.https'), path.resolve(ph, 'web-server/app.ts'));
                fs.renameSync(path.resolve(ph, 'web-server/public/js/lib/build/build.ts.wss'), path.resolve(ph, 'web-server/public/js/lib/build/build.ts'));
                break;
            case '4':
                // use socket.io wss
                var unlinkFiles = ['game-server/app.ts.sio',
                    'game-server/app.ts',
                    'game-server/app.ts.udp',
                    'game-server/app.ts.wss',
                    'game-server/app.ts.mqtt',
                    'web-server/app.ts',
                    'web-server/public/index.html',
                    'web-server/public/js/lib/pomeloclient.ts'];
                for (var i = 0; i < unlinkFiles.length; ++i)
                {
                    fs.unlinkSync(path.resolve(ph, unlinkFiles[i]));
                }

                fs.renameSync(path.resolve(ph, 'game-server/app.ts.sio.wss'), path.resolve(ph, 'game-server/app.ts'));
                fs.renameSync(path.resolve(ph, 'web-server/app.ts.https'), path.resolve(ph, 'web-server/app.ts'));
                fs.renameSync(path.resolve(ph, 'web-server/public/index.html.sio'), path.resolve(ph, 'web-server/public/index.html'));
                fs.renameSync(path.resolve(ph, 'web-server/public/js/lib/pomeloclient.ts.wss'), path.resolve(ph, 'web-server/public/js/lib/pomeloclient.ts'));

                rmdir(path.resolve(ph, 'web-server/public/js/lib/build'));
                rmdir(path.resolve(ph, 'web-server/public/js/lib/local'));
                fs.unlinkSync(path.resolve(ph, 'web-server/public/js/lib/component.tson'));
                break;
            case '5':
                // use socket.io wss
                var unlinkFiles = ['game-server/app.ts.sio',
                    'game-server/app.ts',
                    'game-server/app.ts.wss',
                    'game-server/app.ts.mqtt',
                    'game-server/app.ts.sio.wss',
                    'web-server/app.ts.https',
                    'web-server/public/index.html',
                    'web-server/public/js/lib/component.tson',
                    'web-server/public/js/lib/pomeloclient.ts.wss'];
                for (var i = 0; i < unlinkFiles.length; ++i)
                {
                    fs.unlinkSync(path.resolve(ph, unlinkFiles[i]));
                }

                fs.renameSync(path.resolve(ph, 'game-server/app.ts.udp'), path.resolve(ph, 'game-server/app.ts'));
                rmdir(path.resolve(ph, 'web-server/public/js/lib/build'));
                rmdir(path.resolve(ph, 'web-server/public/js/lib/local'));
                break;
            case '6':
                // use socket.io
                var unlinkFiles = ['game-server/app.ts',
                    'game-server/app.ts.wss',
                    'game-server/app.ts.udp',
                    'game-server/app.ts.sio',
                    'game-server/app.ts.sio.wss',
                    'web-server/app.ts.https',
                    'web-server/public/index.html',
                    'web-server/public/js/lib/component.tson',
                    'web-server/public/js/lib/pomeloclient.ts.wss'];
                for (var i = 0; i < unlinkFiles.length; ++i)
                {
                    fs.unlinkSync(path.resolve(ph, unlinkFiles[i]));
                }

                fs.renameSync(path.resolve(ph, 'game-server/app.ts.mqtt'), path.resolve(ph, 'game-server/app.ts'));
                fs.renameSync(path.resolve(ph, 'web-server/public/index.html.sio'), path.resolve(ph, 'web-server/public/index.html'));

                rmdir(path.resolve(ph, 'web-server/public/js/lib/build'));
                rmdir(path.resolve(ph, 'web-server/public/js/lib/local'));
                break;
        }
        var replaceFiles = ['game-server/app.ts',
            'game-server/package.json',
            'web-server/package.json'];
        for (var j = 0; j < replaceFiles.length; j++)
        {
            var str = fs.readFileSync(path.resolve(ph, replaceFiles[j])).toString();
            fs.writeFileSync(path.resolve(ph, replaceFiles[j]), str.replace('$', name));
        }
        var f = path.resolve(ph, 'game-server/package.json');
        var content = fs.readFileSync(f).toString();
        fs.writeFileSync(f, content.replace('#', version));
    }, TIME_INIT);
}


/**
 * Start application.
 *
 * @param {Object} opts options for `start` operation
 */
function start(opts)
{
    var absScript = path.resolve(opts.directory, 'app.js');
    if (!fs.existsSync(absScript))
    {
        abort(SCRIPT_NOT_FOUND);
    }

    var logDir = path.resolve(opts.directory, 'logs');
    if (!fs.existsSync(logDir))
    {
        fs.mkdirSync(logDir);
    }

    var ls;
    var type = opts.type || constants.RESERVED.ALL;
    var params = [absScript, 'env=' + opts.env, 'type=' + type];
    if (!!opts.id)
    {
        params.push('startId=' + opts.id);
    }
    if (opts.daemon)
    {
        ls = spawn(process.execPath, params, { detached: true, stdio: 'ignore' });
        ls.unref();
        console.log(DAEMON_INFO);
        process.exit(0);
    } else
    {
        ls = spawn(process.execPath, params);
        ls.stdout.on('data', function (data)
        {
            console.log(data.toString());
        });
        ls.stderr.on('data', function (data)
        {
            console.log(data.toString());
        });
    }
}

/**
 * List pomelo processes.
 *
 * @param {Object} opts options for `list` operation
 */
function list(opts)
{
    var id = 'pomelo_list_' + Date.now();
    connectToMaster(id, opts, function (client: AdminClient)
    {
        client.request(co.moduleId, { signal: 'list' }, function (err, data)
        {
            if (err)
            {
                console.error(err);
            }
            var servers = [];
            for (var key in data.msg)
            {
                servers.push(data.msg[key]);
            }
            var comparer = function (a, b)
            {
                if (a.serverType < b.serverType)
                {
                    return -1;
                } else if (a.serverType > b.serverType)
                {
                    return 1;
                } else if (a.serverId < b.serverId)
                {
                    return -1;
                } else if (a.serverId > b.serverId)
                {
                    return 1;
                } else
                {
                    return 0;
                }
            };
            servers.sort(comparer);
            var rows = [];
            rows.push(['serverId', 'serverType', 'pid', 'rss(M)', 'heapTotal(M)', 'heapUsed(M)', 'uptime(m)']);
            servers.forEach(function (server)
            {
                rows.push([server.serverId, server.serverType, server.pid, server.rss, server.heapTotal, server.heapUsed, server.uptime]);
            });
            console.log(cliff.stringifyRows(rows, ['red', 'blue', 'green', 'cyan', 'magenta', 'white', 'yellow']));
            process.exit(0);
        });
    });
}

/**
 * Add server to application.
 *
 * @param {Object} opts options for `add` operation
 */
function add(opts)
{
    var id = 'pomelo_add_' + Date.now();
    connectToMaster(id, opts, function (client)
    {
        client.request(co.moduleId, { signal: 'add', args: opts.args }, function (err)
        {
            if (err)
            {
                console.error(err);
            }
            else
            {
                console.info(ADD_SERVER_INFO);
            }
            process.exit(0);
        });
    });
}

/**
 * Terminal application.
 *
 * @param {String} signal stop/kill
 * @param {Object} opts options for `stop/kill` operation
 */
function terminal(signal, opts)
{
    console.info(CLOSEAPP_INFO);
    // option force just for `kill`
    if (opts.force)
    {
        if (os.platform() === constants.PLATFORM.WIN)
        {
            exec(KILL_CMD_WIN);
        } else
        {
            exec(KILL_CMD_LUX);
        }
        process.exit(1);
        return;
    }
    var id = 'pomelo_terminal_' + Date.now();
    connectToMaster(id, opts, function (client)
    {
        client.request(co.moduleId, {
            signal: signal, ids: opts.serverIds
        }, function (err, msg)
            {
                if (err)
                {
                    console.error(err);
                }
                if (signal === 'kill')
                {
                    if (msg.code === 'ok')
                    {
                        console.log('All the servers have been terminated!');
                    } else
                    {
                        console.log('There may be some servers remained:', msg.serverIds);
                    }
                }
                process.exit(0);
            });
    });
}

function restart(opts)
{
    var id = 'pomelo_restart_' + Date.now();
    var serverIds = [];
    var type = null;
    if (!!opts.id)
    {
        serverIds.push(opts.id);
    }
    if (!!opts.type)
    {
        type = opts.type;
    }
    connectToMaster(id, opts, function (client)
    {
        client.request(co.moduleId, { signal: 'restart', ids: serverIds, type: type }, function (err, fails)
        {
            if (!!err)
            {
                console.error(err);
            } else if (!!fails.length)
            {
                console.info('restart fails server ids: %j', fails);
            } else
            {
                console.info(RESTART_SERVER_INFO);
            }
            process.exit(0);
        });
    });
}

function connectToMaster(id, opts, cb)
{
    var client = new AdminClient({ username: opts.username, password: opts.password, md5: true });
    client.connect(id, opts.host, opts.port, function (err)
    {
        if (err)
        {
            abort(CONNECT_ERROR + err.red);
        }
        if (typeof cb === 'function')
        {
            cb(client);
        }
    });
}

/**
 * Start master slaves.
 *
 * @param {String} option for `startMasterha` operation
 */
function startMasterha(opts)
{
    var configFile = path.join(opts.directory, constants.FILEPATH.MASTER_HA);
    if (!fs.existsSync(configFile))
    {
        abort(MASTER_HA_NOT_FOUND);
    }
    var masterha = require(configFile).masterha;
    for (var i = 0; i < masterha.length; i++)
    {
        var server = masterha[i];
        server.mode = constants.RESERVED.STAND_ALONE;
        server.masterha = 'true';
        server.home = opts.directory;
        runServer(server);
    }
}

/**
 * Check if the given directory `path` is empty.
 *
 * @param {String} path
 * @param {Function} fn
 */
function emptyDirectory(path, fn)
{
    fs.readdir(path, function (err, files)
    {
        if (err && 'ENOENT' !== err.code)
        {
            abort(FILEREAD_ERROR);
        }
        fn(!files || !files.length);
    });
}

/**
 * Prompt confirmation with the given `msg`.
 *
 * @param {String} msg
 * @param {Function} fn
 */
function confirm(msg, fn)
{
    prompt(msg, function (val)
    {
        fn(/^ *y(es)?/i.test(val));
    });
}

/**
 * Prompt input with the given `msg` and callback `fn`.
 *
 * @param {String} msg
 * @param {Function} fn
 */
function prompt(msg, fn)
{
    if (' ' === msg[msg.length - 1])
    {
        process.stdout.write(msg);
    } else
    {
        console.log(msg);
    }
    process.stdin.setEncoding('ascii');
    process.stdin.once('data', function (data)
    {
        fn(data);
    }).resume();
}

/**
 * Exit with the given `str`.
 *
 * @param {String} str
 */
function abort(str)
{
    console.error(str);
    process.exit(1);
}

/**
 * Copy template files to project.
 *
 * @param {String} origin
 * @param {String} target
 */
function copy(origin, target)
{
    if (!fs.existsSync(origin))
    {
        abort(origin + 'does not exist.');
    }
    if (!fs.existsSync(target))
    {
        mkdir(target);
        console.log(('   create : ' as any).green + target);
    }
    fs.readdir(origin, function (err, datalist)
    {
        if (err)
        {
            abort(FILEREAD_ERROR);
        }
        for (var i = 0; i < datalist.length; i++)
        {
            var oCurrent = path.resolve(origin, datalist[i]);
            var tCurrent = path.resolve(target, datalist[i]);
            if (fs.statSync(oCurrent).isFile())
            {
                fs.writeFileSync(tCurrent, fs.readFileSync(oCurrent, ''), '');
                console.log(('   create : ' as any).green + tCurrent);
            } else if (fs.statSync(oCurrent).isDirectory())
            {
                copy(oCurrent, tCurrent);
            }
        }
    });
}

/**
 * Mkdir -p.
 *
 * @param {String} path
 * @param {Function} fn
 */
function mkdir(path, fn?: Function)
{
    mkdirp(path, 0o755, function (err)
    {
        if (err)
        {
            throw err;
        }
        console.log(('   create : ' as any).green + path);
        if (typeof fn === 'function')
        {
            fn();
        }
    });
}

/**
 * Get user's choice on connector selecting
 * 
 * @param {Function} cb
 */
function connectorType(cb)
{
    prompt('Please select underly connector, 1 for websocket(native socket), 2 for socket.io, 3 for wss, 4 for socket.io(wss), 5 for udp, 6 for mqtt: [1]', function (msg)
    {
        switch (msg.trim())
        {
            case '':
                cb(1);
                break;
            case '1':
            case '2':
            case '3':
            case '4':
            case '5':
            case '6':
                cb(msg.trim());
                break;
            default:
                console.log(('Invalid choice! Please input 1 - 5.' as any).red + '\n');
                connectorType(cb);
                break;
        }
    });
}

/**
 * Run server.
 * 
 * @param {Object} server server information
 */
function runServer(server)
{
    var cmd, key;
    var main = path.resolve(server.home, 'app.js');
    if (utils.isLocal(server.host))
    {
        var options = [];
        options.push(main);
        for (key in server)
        {
            options.push(util.format('%s=%s', key, server[key]));
        }
        starter.localrun(process.execPath, null, options);
    } else
    {
        cmd = util.format('cd "%s" && "%s"', server.home, process.execPath);
        cmd += util.format(' "%s" ', main);
        for (key in server)
        {
            cmd += util.format(' %s=%s ', key, server[key]);
        }
        starter.sshrun(cmd, server.host);
    }
}