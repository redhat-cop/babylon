import React from 'react';
import { $getRoot, EditorState, LexicalEditor, TextNode } from 'lexical';
import { InitialEditorStateType, LexicalComposer } from '@lexical/react/LexicalComposer';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import LexicalErrorBoundary from '@lexical/react/LexicalErrorBoundary';
import { LinkPlugin } from '@lexical/react/LexicalLinkPlugin';
import { ListPlugin } from '@lexical/react/LexicalListPlugin';
import { HeadingNode, QuoteNode } from '@lexical/rich-text';
import { AutoLinkNode, LinkNode } from '@lexical/link';
import { CodeHighlightNode, CodeNode } from '@lexical/code';
import { ListItemNode, ListNode } from '@lexical/list';
import { TableCellNode, TableNode, TableRowNode } from '@lexical/table';
import { MarkdownShortcutPlugin } from '@lexical/react/LexicalMarkdownShortcutPlugin';
import { TRANSFORMERS } from '@lexical/markdown';
import { $generateNodesFromDOM } from '@lexical/html';
import ToolbarPlugin from './ToolbarPlugin';
import Theme from './Theme';
import AutoLinkPlugin from './AutoLinkPlugin';

import './editor.css';

// Override the TextNode to detect underline and create an u element https://github.com/facebook/lexical/issues/2452
const exportDOM = TextNode.prototype.exportDOM;
const IS_UNDERLINE = 1 << 3;
TextNode.prototype.exportDOM = function (editor: LexicalEditor) {
  if (this.__format & IS_UNDERLINE) {
    const dom = document.createElement('u');
    dom.textContent = this.__text;
    const maybeUnderline: string | string[] | undefined = editor._config.theme.text?.['underline'];
    if (maybeUnderline) {
      dom.className = Array.isArray(maybeUnderline) ? maybeUnderline.join(' ') : maybeUnderline;
    }
    return { element: dom };
  } else {
    return exportDOM.apply(this, [editor]);
  }
};

const Editor: React.FC<{
  onChange: (editorState: EditorState, editor: LexicalEditor) => void;
  placeholder: string;
  defaultValue?: string;
}> = ({ onChange, placeholder, defaultValue }) => {
  let _defaultValue: InitialEditorStateType = defaultValue;

  try {
    JSON.parse(defaultValue);
  } catch {
    _defaultValue = (editor) => {
      const parser = new DOMParser();
      const dom = parser.parseFromString(defaultValue, 'text/html');
      const nodes = $generateNodesFromDOM(editor, dom);
      const root = $getRoot();
      root.clear();
      root.append(...nodes);
    };
  }
  return (
    <div className="editor">
      <LexicalComposer
        initialConfig={{
          namespace: 'editor',
          editorState: _defaultValue,
          theme: Theme,
          nodes: [
            HeadingNode,
            ListNode,
            ListItemNode,
            QuoteNode,
            CodeNode,
            CodeHighlightNode,
            TableNode,
            TableCellNode,
            TableRowNode,
            AutoLinkNode,
            LinkNode,
          ],
          onError(error) {
            throw error;
          },
        }}
      >
        <div className="editor__container">
          <ToolbarPlugin />
          <div className="editor__inner">
            <RichTextPlugin
              contentEditable={<ContentEditable className="editor__input" />}
              placeholder={<div className="editor__placeholder">{placeholder}</div>}
              ErrorBoundary={LexicalErrorBoundary}
            />
            <OnChangePlugin onChange={onChange} ignoreSelectionChange />
            <HistoryPlugin />
            <ListPlugin />
            <LinkPlugin />
            <AutoLinkPlugin />
            <MarkdownShortcutPlugin transformers={TRANSFORMERS} />
          </div>
        </div>
      </LexicalComposer>
    </div>
  );
};

export default Editor;
