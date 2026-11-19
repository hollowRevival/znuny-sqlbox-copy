// --
// Copyright (C) 2026 Katla, https://github.com/hollowRevival/znuny-sqlbox-copy
// --
// This software comes with ABSOLUTELY NO WARRANTY. For details, see
// the enclosed file COPYING for license information (GPL). If you
// did not receive this file, see https://www.gnu.org/licenses/gpl-3.0.txt.
// --

"use strict";

var Core = Core || {};
Core.Agent = Core.Agent || {};
Core.Agent.Admin = Core.Agent.Admin || {};

/**
 * @namespace Core.Agent.Admin.SqlBoxCopy
 * @memberof Core.Agent.Admin
 * @description
 *      Adds a button to the SQL Box results that copies them as Markdown, TSV or JSON.
 */
Core.Agent.Admin.SqlBoxCopy = (function (TargetNS) {

    var CONTAINER_ID = 'sqlbox-copy',
        STORAGE_KEY = 'SqlBoxCopyFormat',
        NULL_TEXT = 'NULL',
        FENCE = '```',
        FORMATS = [
            { Key: 'markdown', Label: 'MD' },
            { Key: 'tsv', Label: 'TSV' },
            { Key: 'json', Label: 'JSON' }
        ],
        Builders = {
            markdown: BuildMarkdown,
            tsv: BuildTSV,
            json: BuildJSON
        },
        ResetTimer,
        Table,
        Select,
        Label;

    function MarkdownCell(Value) {
        return Value
            .replace(/\|/g, '\\|')
            .replace(/\r?\n/g, '<br>');
    }

    function TSVCell(Value) {
        // Spreadsheets only read embedded tabs and line breaks correctly when the field is quoted.
        return (/[\t\r\n"]/).test(Value) ? '"' + Value.replace(/"/g, '""') + '"' : Value;
    }

    function RowCount(Count) {
        return Count + (Count === 1 ? ' row' : ' rows');
    }

    function QueryText() {
        var Field = document.getElementById('SQL');

        return (Field ? Field.value : '').trim();
    }

    function HeaderNames() {
        return Array.prototype.map.call(Table.querySelectorAll('thead th'), function (Header) {
            return Header.textContent.trim();
        });
    }

    function Collect() {
        var Rows = Array.prototype.slice.call(Table.querySelectorAll('tbody tr')),
            // The filter's own "no matches" row also spans the table but says
            // nothing about the query, so it must not be mistaken for its message.
            MessageRow = Rows.filter(function (Row) {
                return Row.querySelector('td[colspan]') && !Row.classList.contains('FilterMessage');
            })[0],
            DataRows = Rows.filter(function (Row) {
                return !Row.querySelector('td[colspan]');
            });

        return {
            Headers: HeaderNames(),
            Total: DataRows.length,
            Message: MessageRow ? MessageRow.textContent.trim() : 'No rows',
            Rows: DataRows
                .filter(function (Row) {
                    return Row.getClientRects().length;
                })
                .map(function (Row) {
                    return Array.prototype.map.call(Row.querySelectorAll('td'), function (Data) {
                        // The cell text is cut at 80 characters; the full value is in title.
                        return (Data.hasAttribute('title') ? Data.getAttribute('title') : Data.textContent).trim();
                    });
                })
        };
    }

    function BuildMarkdown(Data) {
        var Headers = Data.Headers.map(MarkdownCell),
            Lines;

        if (!Data.Total) {
            return {
                Text: [
                    '**Query result (no rows):**',
                    '',
                    FENCE + 'sql',
                    QueryText(),
                    FENCE,
                    '',
                    'Rows: 0',
                    'Message: ' + Data.Message,
                    'Columns: ' + (Data.Headers.join(', ') || '(none)')
                ].join('\n'),
                Note: 'SQL + ' + Data.Message
            };
        }

        Lines = [
            '|' + Headers.join('|') + '|',
            '|' + Headers.map(function () { return '-'; }).join('|') + '|'
        ];
        Data.Rows.forEach(function (Row) {
            Lines.push('|' + Row.map(MarkdownCell).join('|') + '|');
        });

        return { Text: Lines.join('\n'), Note: 'Markdown, ' + RowCount(Data.Rows.length) };
    }

    function BuildTSV(Data) {
        var Lines = [Data.Headers.map(TSVCell).join('\t')];

        Data.Rows.forEach(function (Row) {
            Lines.push(Row.map(TSVCell).join('\t'));
        });

        return {
            Text: Lines.join('\n'),
            Note: Data.Total ? 'TSV, ' + RowCount(Data.Rows.length) : 'TSV, header only'
        };
    }

    function BuildJSON(Data) {
        var Result = {
            columns: Data.Headers,
            rows: Data.Rows.map(function (Row) {
                return Row.map(function (Value) {
                    // The page renders NULL as the text NULL, which is the only marker available.
                    return Value === NULL_TEXT ? null : Value;
                });
            })
        };

        if (!Data.Total) {
            Result = { sql: QueryText(), message: Data.Message, columns: Data.Headers, rows: [] };
        }

        return { Text: JSON.stringify(Result), Note: 'JSON, ' + RowCount(Data.Rows.length) };
    }

    function Build() {
        var Data = Collect();

        if (Data.Total && !Data.Rows.length) {
            return { Error: 'All rows hidden by the filter' };
        }

        return Builders[Select.value](Data);
    }

    function FallbackCopy(Text) {
        var Textarea = document.createElement('textarea'),
            OK = false;

        Textarea.value = Text;
        Textarea.style.cssText = 'position:fixed;opacity:0';
        document.body.appendChild(Textarea);
        Textarea.select();
        try {
            OK = document.execCommand('copy');
        }
        finally {
            document.body.removeChild(Textarea);
        }
        return OK;
    }

    function ButtonText() {
        return 'Copy as ' + Select.options[Select.selectedIndex].text;
    }

    function Flash(Message) {
        Label.textContent = Message;
        clearTimeout(ResetTimer);
        ResetTimer = setTimeout(function () {
            Label.textContent = ButtonText();
        }, 2500);
    }

    function OnClick() {
        var Result = Build();

        function Done(OK) {
            Flash(OK ? 'Copied: ' + Result.Note : 'Could not copy');
        }

        if (Result.Error) {
            Flash(Result.Error);
            return;
        }

        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(Result.Text)
                .then(function () { Done(true); })
                .catch(function () { Done(FallbackCopy(Result.Text)); });
        }
        else {
            Done(FallbackCopy(Result.Text));
        }
    }

    function LoadFormat() {
        try {
            return window.localStorage.getItem(STORAGE_KEY);
        }
        catch (Exception) {
            // Storage can be blocked (private mode); the choice then resets on the next page.
            return null;
        }
    }

    function SaveFormat(Key) {
        try {
            window.localStorage.setItem(STORAGE_KEY, Key);
        }
        catch (Exception) {
            // See LoadFormat().
        }
    }

    TargetNS.Init = function () {
        var Container,
            Button,
            Saved;

        // The page is also shown before any query has run, when there is no results table.
        Table = document.querySelector('table#Results.DataTable');
        if (!Table || document.getElementById(CONTAINER_ID)) {
            return;
        }

        Container = document.createElement('div');
        Container.id = CONTAINER_ID;
        Container.style.marginBottom = '8px';

        Button = document.createElement('button');
        Button.type = 'button';
        Button.className = 'CallForAction';
        Label = document.createElement('span');
        Button.appendChild(Label);

        Select = document.createElement('select');
        Select.setAttribute('aria-label', 'Copy format');
        Select.style.marginLeft = '6px';
        FORMATS.forEach(function (Format) {
            var Option = document.createElement('option');

            Option.value = Format.Key;
            Option.textContent = Format.Label;
            Select.appendChild(Option);
        });

        Saved = LoadFormat();
        if (FORMATS.some(function (Format) { return Format.Key === Saved; })) {
            Select.value = Saved;
        }
        Label.textContent = ButtonText();

        Select.addEventListener('change', function () {
            SaveFormat(Select.value);
            Label.textContent = ButtonText();
        });
        Button.addEventListener('click', OnClick);

        Container.appendChild(Button);
        Container.appendChild(Select);
        Table.parentNode.insertBefore(Container, Table);
    };

    Core.Init.RegisterNamespace(TargetNS, 'APP_MODULE');

    return TargetNS;
}(Core.Agent.Admin.SqlBoxCopy || {}));
