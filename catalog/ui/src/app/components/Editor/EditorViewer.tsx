import React from 'react';
import { $getRoot } from 'lexical';
import { $generateNodesFromDOM } from '@lexical/html';
import { InitialEditorStateType, LexicalComposer } from '@lexical/react/LexicalComposer';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import LexicalErrorBoundary from '@lexical/react/LexicalErrorBoundary';
import { HeadingNode, QuoteNode } from '@lexical/rich-text';
import { AutoLinkNode, LinkNode } from '@lexical/link';
import { CodeHighlightNode, CodeNode } from '@lexical/code';
import { ListItemNode, ListNode } from '@lexical/list';
import { TableCellNode, TableNode, TableRowNode } from '@lexical/table';
import Theme from './Theme';

import './editor.css';

const EditorViewer: React.FC<{
  value?: string;
}> = ({ value }) => {
  let _defaultValue: InitialEditorStateType = value;
  try {
    JSON.parse(value);
  } catch {
    _defaultValue = (editor) => {
      if (value) {
        const parser = new DOMParser();
        let dom = parser.parseFromString(value, 'text/html');
        if (!Array.from(dom.body.childNodes).some((node) => node.nodeType === 1)) {
          dom = parser.parseFromString(`<p>${value}</p>`, 'text/html');
        }
        const nodes = $generateNodesFromDOM(editor, dom);
        const root = $getRoot();
        root.clear();
        root.append(...nodes);
      }
    };
  }
  return (
    <div className="editor editor-viewer">
      <LexicalComposer
        initialConfig={{
          editable: false,
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
        <RichTextPlugin contentEditable={<ContentEditable />} placeholder="" ErrorBoundary={LexicalErrorBoundary} />
      </LexicalComposer>
    </div>
  );
};

export default EditorViewer;
